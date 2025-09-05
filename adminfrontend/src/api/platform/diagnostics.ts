import { platformApiRequest } from './base';

export const diagnosticsApi = {
  async getPrismaCache(): Promise<Record<string, any>> {
    return platformApiRequest('/diagnostics/prisma-cache');
  },
};