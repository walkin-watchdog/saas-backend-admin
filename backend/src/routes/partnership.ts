import express from 'express';
import { EmailService } from '../services/emailService';
import { TenantRequest } from '../middleware/tenantMiddleware';

const router = express.Router();

router.post('/', async (req: TenantRequest, res) => {
  const { name, email, phone, message, partnershipType, website, contactPerson } = req.body;

  if (!name || !email || !phone || !message || !partnershipType) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    await EmailService.sendPartnershipRequest({
      companyName: name,
      contactPerson,
      email,
      phone,
      message,
      partnershipType,
      website,
    });

    // Respond with success
    res.status(200).json({ message: 'Partnership application submitted successfully' });
  } catch (error) {
    console.error('Error sending partnership request email:', error);
    res.status(500).json({ message: 'Failed to submit partnership application. Please try again.' });
  }
});

export default router;