import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';

const ForgePage = lazy(() => import('../pages/forge/page'));
const VaultPage = lazy(() => import('../pages/vault/page'));
const DuelPage = lazy(() => import('../pages/duel/page'));
const NotFound = lazy(() => import('../pages/NotFound'));

const routes: RouteObject[] = [
  {
    path: '/',
    element: <ForgePage />,
  },
  {
    path: '/forge',
    element: <ForgePage />,
  },
  {
    path: '/vault',
    element: <VaultPage />,
  },
  {
    path: '/duel',
    element: <DuelPage />,
  },
  {
    path: '*',
    element: <NotFound />,
  },
];

export default routes;