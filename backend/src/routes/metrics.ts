import { Router } from 'express';
import { promRegister } from '../utils/metrics';

const router = Router();

router.get('/', async (_req, res) => {
  res.set('Content-Type', promRegister.contentType);
  res.end(await promRegister.metrics());
});

export default router;