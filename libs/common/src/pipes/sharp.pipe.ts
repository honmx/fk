import { Injectable, PipeTransform } from "@nestjs/common";
import * as path from "path";
import * as sharp from "sharp";

@Injectable()
export class SharpPipe implements PipeTransform<Express.Multer.File, Promise<Express.Multer.File>> {

  async transform(image: Express.Multer.File): Promise<Express.Multer.File> {
    const sharpedFileBuffer = await sharp(image.buffer)
      .webp({ effort: 3 })
      .toBuffer();
    
    return {
      ...image,
      buffer: sharpedFileBuffer
    }
  }

}