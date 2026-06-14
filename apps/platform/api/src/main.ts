/**
 * NestJS 应用入口：启动 HTTP 服务。
 *
 * 边界：
 * - 不负责：业务逻辑（由各 Module 处理）
 *
 * 入口：
 * - bootstrap()
 */

import 'dotenv/config';
import { validateRequiredEnv } from './core/config/env.validation';
import { initHttpDispatcher } from './core/http/http-fetch';

validateRequiredEnv();

initHttpDispatcher();

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { networkInterfaces } from 'node:os';
import { AppModule } from './app.module';

function getLocalIPv4Addresses(): string[] {
  const addresses: string[] = [];
  for (const interfaces of Object.values(networkInterfaces())) {
    for (const net of interfaces ?? []) {
      const isIPv4 = String(net.family) === 'IPv4';
      if (isIPv4 && !net.internal) {
        addresses.push(net.address);
      }
    }
  }
  return addresses;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.enableCors({ origin: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(`API 已启动 → http://localhost:${port}`);
  logger.log(`健康检查 → http://localhost:${port}/api/v1/health`);
  for (const ip of getLocalIPv4Addresses()) {
    logger.log(`局域网访问 → http://${ip}:${port}`);
  }
}

void bootstrap();
