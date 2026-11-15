import { authRouter } from './modules/auth.routes';
import { usersRouter } from './modules/users.routes';
import { floorsRouter, spotsRouter } from './modules/floors.routes';
import { tenantsRouter } from './modules/tenants.routes';
import { contractsRouter } from './modules/contracts.routes';
import { dashboardRouter } from './modules/dashboard.routes';
import { reportsRouter } from './modules/reports.routes';
import { settingsRouter, miscRouter } from './modules/settings.routes';
import { importRouter } from './modules/import/import.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';

/** Every API module. Order matters only for identical patterns (none overlap). */
export const routers = [
  authRouter,
  usersRouter,
  floorsRouter,
  spotsRouter,
  tenantsRouter,
  contractsRouter,
  dashboardRouter,
  reportsRouter,
  settingsRouter,
  importRouter,
  notificationsRouter,
  miscRouter,
];
