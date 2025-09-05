import { logger } from '../utils/logger';
import { ProductService } from './productService';
import { DestinationService } from './destinationService';
import { AttractionService } from './attractionService';
import { ExperienceCategoryService } from './experienceCategoryService';
import fs from 'fs';
import path from 'path';

export class SitemapService {
  private static SITEMAP_PATH = path.join(process.cwd(), 'public', 'sitemap.xml');

  static async generateSitemap(): Promise<string> {
    try {
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      
      // Fetch all published products
      const products = await ProductService.findManyProducts({
        where: { 
          isActive: true,
          isDraft: false
        },
        select: { 
          slug: true,
          updatedAt: true
        }
      });
      
      // Fetch all destinations
      const destinations = await DestinationService.findManyDestinations({
        select: {
          slug: true,
          updatedAt: true
        }
      });

      const attractions = await AttractionService.findManyAttractions({
        select: {
          slug: true,
          updatedAt: true
        }
      });
      
      // Fetch all experience categories
      const experienceCategories = await ExperienceCategoryService.findManyExperienceCategories({
        select: {
          slug: true,
          updatedAt: true
        }
      });
      
      // Start building the sitemap XML
      let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;
      
      // Add static pages
      const staticPages = [
        { url: '/', priority: 1.0, changefreq: 'weekly' },
        { url: '/explore-destinations-luxe-time-travel', priority: 0.9, changefreq: 'weekly' },
        { url: '/explore-attractions-luxe-time-travel', priority: 0.9, changefreq: 'weekly' },
        { url: '/luxe-experiences', priority: 0.9, changefreq: 'weekly' },
        { url: '/the-luxe-journal', priority: 0.8, changefreq: 'daily' },
        { url: '/offers', priority: 0.9, changefreq: 'weekly' },
        { url: '/about-us', priority: 0.7, changefreq: 'monthly' },
        { url: '/contact-us-luxe-time-travel', priority: 0.7, changefreq: 'monthly' },
        { url: '/faq-luxe-time-travel-assistance', priority: 0.6, changefreq: 'monthly' },
        { url: '/sustainable-travel-responsible-tourism-at-luxe', priority: 0.6, changefreq: 'monthly' },
        { url: '/luxe-time-travel-policies-booking-pay', priority: 0.5, changefreq: 'monthly' },
        { url: '/plan-your-trip-luxe-time-travel-assistance', priority: 0.8, changefreq: 'weekly' },
        { url: '/life-at-ltt', priority: 0.6, changefreq: 'weekly' },
        { url: '/partner-program', priority: 0.6, changefreq: 'weekly' },
      ];
      
      for (const page of staticPages) {
        sitemap += `
  <url>
    <loc>${baseUrl}${page.url}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`;
      }
      
      // Add dynamic product pages
      for (const product of products) {
        if (product.slug) {
          sitemap += `
  <url>
    <loc>${baseUrl}/p/${product.slug}</loc>
    <lastmod>${product.updatedAt.toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
        }
      }
      
      // Add destination pages
      for (const destination of destinations) {
        sitemap += `
  <url>
    <loc>${baseUrl}/explore-destinations-luxe-time-travel/${destination.slug}</loc>
    <lastmod>${destination.updatedAt.toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
      }

      // Add attraction pages
      for (const attraction of attractions) {
        sitemap += `
  <url>
    <loc>${baseUrl}/explore-attractions-luxe-time-travel/${attraction.slug}</loc>
    <lastmod>${attraction.updatedAt.toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
      }
      
      // Add experience category pages
      for (const category of experienceCategories) {
        sitemap += `
  <url>
    <loc>${baseUrl}/luxe-experiences/${category.slug}</loc>
    <lastmod>${category.updatedAt.toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
      }
      
      // Close the sitemap XML
      sitemap += `
</urlset>`;
      
      // Ensure the public directory exists
      const dir = path.dirname(this.SITEMAP_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Write the sitemap to a file
      fs.writeFileSync(this.SITEMAP_PATH, sitemap);
      
      logger.info('Sitemap generated successfully');
      
      return sitemap;
    } catch (error) {
      logger.error('Error generating sitemap:', error);
      throw new Error('Failed to generate sitemap');
    }
  }
  
  static async getSitemap(): Promise<string> {
    try {
      if (!fs.existsSync(this.SITEMAP_PATH)) {
        return await this.generateSitemap();
      }
      
      return fs.readFileSync(this.SITEMAP_PATH, 'utf8');
    } catch (error) {
      logger.error('Error reading sitemap:', error);
      throw new Error('Failed to read sitemap');
    }
  }
}