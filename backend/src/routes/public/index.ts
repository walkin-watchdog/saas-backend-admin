import express from 'express';
import plans from './plans';
import signup from './signup';
import request from './request';
import signupSession from './signupSession';
import verifyEmail from './verifyEmail';
import branding from './branding';

const router = express.Router();

router.use('/plans', plans);
router.use('/signup', signup);
router.use('/request', request);
router.use('/signup/session', signupSession);
router.use('/verify-email', verifyEmail);
router.use('/branding', branding);

export default router;