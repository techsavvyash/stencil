import {
  ClassSerializerInterceptor,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { useContainer } from 'class-validator';
import { AppModule } from './app.module';
import validationOptions from './utils/validation-options';
import { AllConfigType } from './config/config.type';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { MonitoringService } from './monitoring/monitoring.service';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    {
      cors: true,
    },
  );
  useContainer(app.select(AppModule), { fallbackOnErrors: true });
  const configService = app.get(ConfigService<AllConfigType>);

  app.enableShutdownHooks();
  app.setGlobalPrefix(
    configService.getOrThrow('app.apiPrefix', { infer: true }),
    {
      exclude: ['/'],
    },
  );
  app.enableVersioning({
    type: VersioningType.URI,
  });
  app.useGlobalPipes(new ValidationPipe(validationOptions));
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  const options = new DocumentBuilder()
    .setTitle('API')
    .setDescription('API docs')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('docs', app, document);

  process.on('exit', (code) => {
    console.log(`Process is exiting with code: ${code}`);
  });

  process.on('beforeExit', async () => {
    console.log('process exit...');
    const monitoringService = app.get<MonitoringService>(MonitoringService);
    await monitoringService.onExit();
  });

  process.on('SIGINT', async () => {
    console.log('Received SIGINT signal. Gracefully shutting down...');
    const monitoringService = app.get<MonitoringService>(MonitoringService);
    await monitoringService.onExit();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM signal. Gracefully shutting down...');
    const monitoringService = app.get<MonitoringService>(MonitoringService);
    await monitoringService.onExit();
    process.exit(0);
  });

  await app.listen(configService.getOrThrow('app.port', { infer: true }));
}
void bootstrap();
