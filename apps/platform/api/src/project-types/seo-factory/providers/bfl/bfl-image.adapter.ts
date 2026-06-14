/**
 * Black Forest Labs 官方生图适配器：实现 IImageProvider（异步提交 + polling_url 轮询）。
 *
 * 边界：
 * - 不负责：正文植入（IllustrationService）
 *
 * 入口：
 * - BflImageAdapter
 *
 * 环境变量：
 * - BFL_API_KEY（必填）
 * - BFL_API_BASE_URL（默认 https://api.bfl.ai）
 * - BFL_IMAGE_ENDPOINT（默认 flux-2-klein-4b，最低成本档）
 */

import { Injectable } from '@nestjs/common';
import type { IImageProvider, ImageResult } from '@wm/provider-interfaces';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { fetchWithRetry } from '../../../../core/http/http-fetch';
import { LoggerService } from '../../../../core/logger/logger.service';
import {
  extractPollingUrl,
  extractReadyImageUrl,
  isTerminalFailureStatus,
  type BflCreateResponse,
  type BflPollResponse,
} from './bfl-poll.util';

const REQUEST_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 500;
const MAX_POLL_MS = 120_000;
const DEFAULT_WIDTH = 1024;
const DEFAULT_HEIGHT = 1024;

@Injectable()
export class BflImageAdapter implements IImageProvider {
  constructor(private readonly logger: LoggerService) {}

  async generateImage(prompt: string): Promise<ImageResult> {
    const apiKey = process.env.BFL_API_KEY?.trim();
    if (!apiKey) {
      throw new BusinessException(ErrorCodes.EXTERNAL_API_ERROR, 'BFL_API_KEY 未配置');
    }

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '生图 prompt 不能为空');
    }

    const baseUrl = (process.env.BFL_API_BASE_URL ?? 'https://api.bfl.ai').replace(/\/$/, '');
    const endpoint = (process.env.BFL_IMAGE_ENDPOINT ?? 'flux-2-klein-4b').replace(/^\/+|\/+$/g, '');
    const createUrl = `${baseUrl}/v1/${endpoint}`;

    const pollingUrl = await this.submitGeneration(createUrl, apiKey, trimmedPrompt);
    const imageUrl = await this.pollUntilReady(pollingUrl, apiKey);

    this.logger.info('BFL image generated', {
      action: 'bfl.image_generated',
      endpoint,
    });

    return {
      url: imageUrl,
      alt: trimmedPrompt.slice(0, 120),
    };
  }

  private async submitGeneration(
    createUrl: string,
    apiKey: string,
    prompt: string,
  ): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetchWithRetry(
        createUrl,
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'Content-Type': 'application/json',
            'x-key': apiKey,
          },
          body: JSON.stringify({
            prompt,
            width: DEFAULT_WIDTH,
            height: DEFAULT_HEIGHT,
          }),
          signal: controller.signal,
        },
        { label: 'BFL' },
      );

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new BusinessException(
          ErrorCodes.EXTERNAL_API_ERROR,
          `BFL 生图提交失败：HTTP ${response.status}${detail ? ` — ${detail.slice(0, 200)}` : ''}`,
        );
      }

      const body = (await response.json()) as BflCreateResponse;
      const pollingUrl = extractPollingUrl(body);
      if (!pollingUrl) {
        throw new BusinessException(
          ErrorCodes.EXTERNAL_API_ERROR,
          'BFL 生图响应缺少 polling_url',
        );
      }

      return pollingUrl;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async pollUntilReady(pollingUrl: string, apiKey: string): Promise<string> {
    const deadline = Date.now() + MAX_POLL_MS;

    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetchWithRetry(
          pollingUrl,
          {
            method: 'GET',
            headers: {
              accept: 'application/json',
              'x-key': apiKey,
            },
            signal: controller.signal,
          },
          { label: 'BFL poll' },
        );

        if (!response.ok) {
          throw new BusinessException(
            ErrorCodes.EXTERNAL_API_ERROR,
            `BFL 生图轮询失败：HTTP ${response.status}`,
          );
        }

        const body = (await response.json()) as BflPollResponse;
        const readyUrl = extractReadyImageUrl(body);
        if (readyUrl) {
          return readyUrl;
        }

        if (isTerminalFailureStatus(body.status)) {
          throw new BusinessException(
            ErrorCodes.EXTERNAL_API_ERROR,
            `BFL 生图失败：${body.status ?? 'Unknown'}`,
          );
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new BusinessException(ErrorCodes.EXTERNAL_API_ERROR, 'BFL 生图轮询超时');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
