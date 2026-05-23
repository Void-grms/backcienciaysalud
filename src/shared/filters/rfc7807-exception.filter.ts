import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance: string;
  errors?: Array<{ field: string; message: string }>;
}

@Catch()
export class Rfc7807ExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(Rfc7807ExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, problem } = this.toProblem(exception, request.originalUrl ?? request.url);

    if (status >= 500) {
      this.logger.error(
        { err: exception, path: problem.instance, status },
        'Excepcion no controlada',
      );
    }

    response.status(status).type('application/problem+json').json(problem);
  }

  private toProblem(
    exception: unknown,
    instance: string,
  ): { status: number; problem: ProblemDetails } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const base: ProblemDetails = {
        type: `https://errors.lab/${this.slug(status)}`,
        title: this.titleFor(status),
        status,
        instance,
      };

      if (typeof res === 'string') {
        return { status, problem: { ...base, detail: res } };
      }

      const body = res as Record<string, unknown>;
      const message = body.message;
      const detail =
        typeof message === 'string'
          ? message
          : Array.isArray(message)
            ? 'Datos invalidos'
            : (body.error as string | undefined);

      const errors = Array.isArray(message)
        ? message.map((m) => ({ field: '', message: String(m) }))
        : undefined;

      return {
        status,
        problem: { ...base, detail, ...(errors ? { errors } : {}) },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      problem: {
        type: 'https://errors.lab/internal',
        title: 'Error interno del servidor',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        detail: 'Ocurrio un error inesperado. Intenta nuevamente.',
        instance,
      },
    };
  }

  private titleFor(status: number): string {
    const map: Record<number, string> = {
      400: 'Datos invalidos',
      401: 'No autenticado',
      403: 'No autorizado',
      404: 'Recurso no encontrado',
      409: 'Conflicto',
      422: 'Estado invalido para la operacion',
      429: 'Demasiadas peticiones',
      500: 'Error interno del servidor',
    };
    return map[status] ?? 'Error';
  }

  private slug(status: number): string {
    const map: Record<number, string> = {
      400: 'validation',
      401: 'unauthenticated',
      403: 'forbidden',
      404: 'not-found',
      409: 'conflict',
      422: 'unprocessable',
      429: 'throttled',
      500: 'internal',
    };
    return map[status] ?? 'error';
  }
}
