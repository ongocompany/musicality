package expo.modules.audioextractor

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID
import kotlin.math.roundToInt

class AudioExtractorModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AudioExtractor")

    AsyncFunction("extractAndDownsample") { uri: String, promise: Promise ->
      Thread {
        try {
          val outputPath = extractAndDownsample(uri)
          promise.resolve(outputPath)
        } catch (e: Exception) {
          promise.reject("ERR_EXTRACT", e.message ?: "Unknown error", e)
        }
      }.start()
    }
  }

  private fun extractAndDownsample(uri: String): String {
    val context = appContext.reactContext ?: throw Exception("React context not available")

    // Resolve file path
    val filePath = when {
      uri.startsWith("file://") -> Uri.parse(uri).path ?: throw Exception("Invalid file URI")
      uri.startsWith("/") -> uri
      uri.startsWith("content://") -> uri // MediaExtractor handles content URIs
      else -> throw Exception("Unsupported URI scheme: $uri")
    }

    // Setup MediaExtractor
    val extractor = MediaExtractor()
    try {
      if (uri.startsWith("content://")) {
        extractor.setDataSource(context, Uri.parse(uri), null)
      } else {
        extractor.setDataSource(filePath)
      }
    } catch (e: Exception) {
      throw Exception("Cannot open audio file: ${e.message}")
    }

    // Find audio track
    var audioTrackIndex = -1
    var inputFormat: MediaFormat? = null
    for (i in 0 until extractor.trackCount) {
      val format = extractor.getTrackFormat(i)
      val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
      if (mime.startsWith("audio/")) {
        audioTrackIndex = i
        inputFormat = format
        break
      }
    }

    if (audioTrackIndex < 0 || inputFormat == null) {
      extractor.release()
      throw Exception("No audio track found in file")
    }

    extractor.selectTrack(audioTrackIndex)

    val inputSampleRate = inputFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
    val inputChannels = inputFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
    val mime = inputFormat.getString(MediaFormat.KEY_MIME)!!

    // Setup MediaCodec for decoding to PCM
    val codec = MediaCodec.createDecoderByType(mime)
    val outputFormat = MediaFormat().apply {
      setString(MediaFormat.KEY_MIME, MediaFormat.MIMETYPE_AUDIO_RAW)
      setInteger(MediaFormat.KEY_SAMPLE_RATE, inputSampleRate)
      setInteger(MediaFormat.KEY_CHANNEL_COUNT, inputChannels)
      setInteger(MediaFormat.KEY_PCM_ENCODING, android.media.AudioFormat.ENCODING_PCM_16BIT)
    }

    codec.configure(inputFormat, null, null, 0)
    codec.start()

    // Decode all audio to PCM 16-bit
    val pcmChunks = mutableListOf<ByteArray>()
    val bufferInfo = MediaCodec.BufferInfo()
    var inputDone = false
    var outputDone = false
    val timeoutUs = 10_000L

    while (!outputDone) {
      // Feed input
      if (!inputDone) {
        val inputIndex = codec.dequeueInputBuffer(timeoutUs)
        if (inputIndex >= 0) {
          val inputBuffer = codec.getInputBuffer(inputIndex)!!
          val sampleSize = extractor.readSampleData(inputBuffer, 0)
          if (sampleSize < 0) {
            codec.queueInputBuffer(inputIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
            inputDone = true
          } else {
            val presentationTimeUs = extractor.sampleTime
            codec.queueInputBuffer(inputIndex, 0, sampleSize, presentationTimeUs, 0)
            extractor.advance()
          }
        }
      }

      // Drain output
      val outputIndex = codec.dequeueOutputBuffer(bufferInfo, timeoutUs)
      if (outputIndex >= 0) {
        if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
          outputDone = true
        }
        val outputBuffer = codec.getOutputBuffer(outputIndex)!!
        val chunk = ByteArray(bufferInfo.size)
        outputBuffer.position(bufferInfo.offset)
        outputBuffer.get(chunk)
        if (chunk.isNotEmpty()) {
          pcmChunks.add(chunk)
        }
        codec.releaseOutputBuffer(outputIndex, false)
      } else if (outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
        // Format changed, continue
      }
    }

    codec.stop()
    codec.release()
    extractor.release()

    // Merge all PCM chunks
    val totalSize = pcmChunks.sumOf { it.size }
    if (totalSize == 0) throw Exception("No audio samples decoded")

    val fullPcm = ByteArray(totalSize)
    var offset = 0
    for (chunk in pcmChunks) {
      System.arraycopy(chunk, 0, fullPcm, offset, chunk.size)
      offset += chunk.size
    }

    // Convert to mono if stereo
    val monoPcm: ByteArray
    if (inputChannels > 1) {
      val samplesPerChannel = totalSize / (2 * inputChannels)
      monoPcm = ByteArray(samplesPerChannel * 2)
      val srcBuf = ByteBuffer.wrap(fullPcm).order(ByteOrder.LITTLE_ENDIAN)
      val dstBuf = ByteBuffer.wrap(monoPcm).order(ByteOrder.LITTLE_ENDIAN)
      for (i in 0 until samplesPerChannel) {
        var sum = 0L
        for (ch in 0 until inputChannels) {
          sum += srcBuf.getShort((i * inputChannels + ch) * 2).toLong()
        }
        dstBuf.putShort(i * 2, (sum / inputChannels).toInt().toShort())
      }
    } else {
      monoPcm = fullPcm
    }

    // Downsample to 22050Hz
    val targetSampleRate = 22050
    val resampledPcm: ByteArray
    if (inputSampleRate != targetSampleRate) {
      val ratio = inputSampleRate.toDouble() / targetSampleRate
      val inputSamples = monoPcm.size / 2
      val outputSamples = (inputSamples / ratio).roundToInt()
      resampledPcm = ByteArray(outputSamples * 2)
      val srcBuf = ByteBuffer.wrap(monoPcm).order(ByteOrder.LITTLE_ENDIAN)
      val dstBuf = ByteBuffer.wrap(resampledPcm).order(ByteOrder.LITTLE_ENDIAN)
      for (i in 0 until outputSamples) {
        val srcIdx = (i * ratio).toInt().coerceAtMost(inputSamples - 1)
        dstBuf.putShort(i * 2, srcBuf.getShort(srcIdx * 2))
      }
    } else {
      resampledPcm = monoPcm
    }

    // Write WAV file
    val outputFile = File(context.cacheDir, "ritmo_extracted_${UUID.randomUUID().toString().take(8)}.wav")
    writeWavFile(outputFile, resampledPcm, targetSampleRate, 16, 1)

    return outputFile.absolutePath
  }

  private fun writeWavFile(file: File, pcmData: ByteArray, sampleRate: Int, bitsPerSample: Int, channels: Int) {
    val bytesPerSample = bitsPerSample / 8
    val byteRate = sampleRate * channels * bytesPerSample
    val blockAlign = channels * bytesPerSample
    val dataSize = pcmData.size
    val fileSize = 36 + dataSize

    FileOutputStream(file).use { fos ->
      val buf = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)

      // RIFF header
      buf.put("RIFF".toByteArray())
      buf.putInt(fileSize)
      buf.put("WAVE".toByteArray())

      // fmt chunk
      buf.put("fmt ".toByteArray())
      buf.putInt(16)
      buf.putShort(1) // PCM
      buf.putShort(channels.toShort())
      buf.putInt(sampleRate)
      buf.putInt(byteRate)
      buf.putShort(blockAlign.toShort())
      buf.putShort(bitsPerSample.toShort())

      // data chunk
      buf.put("data".toByteArray())
      buf.putInt(dataSize)

      fos.write(buf.array())
      fos.write(pcmData)
    }
  }
}
