import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { z } from 'zod';

export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'validation_failed',
        issues: result.error.issues,
      });
    }
    return result.data;
  }
}
