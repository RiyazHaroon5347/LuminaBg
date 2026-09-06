import { AutoModel, AutoProcessor, RawImage, env } from '@huggingface/transformers';

// Skip local model check since we are running in browser
env.allowLocalModels = false;

class Segmenter {
  static model = null;
  static processor = null;

  static async getInstance(progress_callback = null) {
    if (this.model === null) {
      this.model = await AutoModel.from_pretrained('briaai/RMBG-1.4', {
        progress_callback,
        device: 'webgpu' // Will fallback to wasm automatically if not supported
      });
      this.processor = await AutoProcessor.from_pretrained('briaai/RMBG-1.4');
    }
    return { model: this.model, processor: this.processor };
  }
}

// Listen for messages from the main thread
self.addEventListener('message', async (event) => {
  const { type, payload } = event.data;

  if (type === 'load') {
    try {
      await Segmenter.getInstance((data) => {
        self.postMessage({ status: 'progress', progress: data });
      });
      self.postMessage({ status: 'ready' });
    } catch (e) {
      self.postMessage({ status: 'error', error: e.message });
    }
  } else if (type === 'segment') {
    try {
      const { model, processor } = await Segmenter.getInstance();
      
      const image = await RawImage.fromURL(payload.image);
      const inputs = await processor(image);
      
      const result = await model({ input: inputs.pixel_values });
      
      const outputTensor = result.output || result[Object.keys(result)[0]];
      
      // Convert float32 values (0 to 1) to Uint8ClampedArray (0 to 255)
      const maskData = new Uint8ClampedArray(outputTensor.data.length);
      for (let i = 0; i < outputTensor.data.length; ++i) {
          maskData[i] = Math.round(outputTensor.data[i] * 255);
      }
      
      // Create RawImage for the mask (1024x1024 as per model output)
      const maskImage = new RawImage(maskData, outputTensor.dims[3], outputTensor.dims[2], 1);
      
      // Resize back to original image dimensions for HIGH QUALITY!
      const resizedMask = await maskImage.resize(image.width, image.height);
      
      self.postMessage({
        status: 'complete',
        result: {
           width: resizedMask.width,
           height: resizedMask.height,
           data: resizedMask.data, // 1-channel Uint8Array
           channels: resizedMask.channels
        }
      });
    } catch (e) {
      self.postMessage({ status: 'error', error: e.message });
    }
  }
});
