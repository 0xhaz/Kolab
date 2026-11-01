import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service.js';
import { UploadsController } from './uploads.controller.js';
import { UploadLinksService } from './upload-links.service.js';

@Global()
@Module({ controllers: [UploadsController], providers: [StorageService, UploadLinksService], exports: [StorageService, UploadLinksService] })
export class UploadsModule {}
