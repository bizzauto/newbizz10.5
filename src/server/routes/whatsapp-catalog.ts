import { Router, Request, Response } from 'express';
import { prisma } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/auth.js';
import { AuthRequest } from '../middleware/auth.js';

const router = Router();

// GET /api/whatsapp-catalog — list catalog items for business
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const items = await prisma.whatsAppCatalog.findMany({
      where: { businessId: req.user?.businessId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: items });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/whatsapp-catalog/sync-from-ecommerce — bulk push ecom products to WA catalog
router.post('/sync-from-ecommerce', requireRole('OWNER', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const businessId = req.user.businessId;

    const ecommerceProducts = await prisma.product.findMany({
      where: { businessId, isActive: true },
    });

    if (ecommerceProducts.length === 0) {
      return res.json({
        success: true,
        data: { synced: 0, updated: 0, message: 'No active ecommerce products found' },
      });
    }

    let synced = 0;
    let updated = 0;

    for (const product of ecommerceProducts) {
      const catalogData = {
        name: product.name,
        description: product.description,
        price: product.price,
        currency: 'INR',
        imageUrl: product.mainImage || (product.images as string[])?.[0] || null,
        category: product.category,
        availability: product.quantity > 0 ? 'in_stock' : 'out_of_stock',
        isActive: product.isActive,
      };

      const existing = await prisma.whatsAppCatalog.findFirst({
        where: { businessId, productId: product.id },
      });

      if (existing) {
        await prisma.whatsAppCatalog.update({
          where: { id: existing.id },
          data: catalogData,
        });
        updated++;
      } else {
        await prisma.whatsAppCatalog.create({
          data: { businessId, productId: product.id, ...catalogData },
        });
        synced++;
      }
    }

    res.json({
      success: true,
      data: { synced, updated, total: ecommerceProducts.length },
    });
  } catch (error: any) {
    console.error('Catalog sync error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/whatsapp-catalog/stats
router.get('/stats', async (req: AuthRequest, res: Response) => {
  try {
    const [total, inStock, outOfStock] = await Promise.all([
      prisma.whatsAppCatalog.count({ where: { businessId: req.user?.businessId } }),
      prisma.whatsAppCatalog.count({ where: { businessId: req.user?.businessId, availability: 'in_stock' } }),
      prisma.whatsAppCatalog.count({ where: { businessId: req.user?.businessId, availability: 'out_of_stock' } }),
    ]);
    res.json({ success: true, data: { total, inStock, outOfStock } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
