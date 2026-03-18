/**
 * Type declarations for `music-tempo` package.
 * The package has no bundled TypeScript types, so we declare them here.
 *
 * Based on: https://github.com/killercrush/music-tempo
 * Algorithm: Beatroot (Simon Dixon, 2001)
 */

declare module 'music-tempo' {
  interface MusicTempoOptions {
    /** FFT window size. Default: 2048 */
    bufferSize?: number;
    /** Spacing of audio frames in samples. Default: 441 (≈10ms at 44100Hz) */
    hopSize?: number;
    /** How quickly previous peaks are forgotten. Default: 0.84 */
    decayRate?: number;
    /** Minimum distance between peaks. Default: 6 */
    peakFindingWindow?: number;
    /** Multiplier for peak finding window. Default: 3 */
    meanWndMultiplier?: number;
    /** Minimum value of peaks. Default: 0.35 */
    peakThreshold?: number;
    /** Maximum difference in IOIs in the same cluster. Default: 0.025 */
    widthTreshold?: number;
    /** Maximum IOI for inclusion in a cluster (seconds). Default: 2.5 */
    maxIOI?: number;
    /** Minimum IOI for inclusion in a cluster (seconds). Default: 0.07 */
    minIOI?: number;
    /** Initial amount of tempo hypotheses. Default: 10 */
    maxTempos?: number;
    /** Minimum inter-beat interval in seconds (0.30s = 200 BPM). Default: 0.3 */
    minBeatInterval?: number;
    /** Maximum inter-beat interval in seconds (1.00s = 60 BPM). Default: 1.0 */
    maxBeatInterval?: number;
    /** Duration of the initial section in seconds. Default: 5 */
    initPeriod?: number;
    /** JND of IBI for removing duplicate agents. Default: 0.02 */
    thresholdBI?: number;
    /** JND of phase for removing duplicate agents. Default: 0.04 */
    thresholdBT?: number;
    /** Time after which an Agent with no accepted beats is destroyed. Default: 10 */
    expiryTime?: number;
  }

  /**
   * Extracts tempo (BPM) and beat positions from audio PCM data.
   *
   * @param audioData - Mono PCM Float32Array, range [-1, +1].
   *                    Assumes 44100Hz sample rate by default.
   * @param params    - Optional analysis parameters
   *
   * @throws string "Tempo extraction failed" if analysis fails (not an Error object!)
   */
  class MusicTempo {
    constructor(audioData: Float32Array, params?: MusicTempoOptions);

    /** Detected tempo in beats per minute */
    readonly tempo: number;

    /** Beat timestamps in seconds */
    readonly beats: number[];

    /** Inter-beat interval in seconds */
    readonly beatInterval: number;
  }

  export default MusicTempo;
}
