import express from 'express';
import translate from 'google-translate-api-x';
import { TenantRequest } from '../middleware/tenantMiddleware';

const router = express.Router();

router.post('/', async (req: TenantRequest, res) => {
  const { text, to } = req.body;
  try {
    const result = await translate(text, { to });
    if (Array.isArray(result)) {
      res.json({ text: result.map(r => r.text)});
    } else if ('text' in result) {
      res.json({ text: result.text });
    } else {
      res.status(500).json({ error: 'Unexpected translation response format' });
    }
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

export default router;