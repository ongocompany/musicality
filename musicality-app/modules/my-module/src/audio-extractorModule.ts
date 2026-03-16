import { requireNativeModule } from 'expo';

interface AudioExtractorInterface {
  extractAndDownsample(uri: string): Promise<string>;
}

export default requireNativeModule<AudioExtractorInterface>('AudioExtractor');
