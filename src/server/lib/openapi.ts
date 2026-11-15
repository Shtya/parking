import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { z } from './zod';


export const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'bearerAuth', { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' });

export const ErrorSchema = registry.register(
  'Error',
  z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.any().optional() }) }),
);

export function buildOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'Parking Management System API',
      version: '1.0.0',
      description:
        'REST API for floors, spots (interactive map), tenants, annual contracts, reminders, dashboard, reports and Excel import.\n\n' +
        'Authenticate with `POST /api/auth/login`, then click **Authorize** and paste the `accessToken`.',
    },
    servers: [{ url: '/' }],
  });
}
