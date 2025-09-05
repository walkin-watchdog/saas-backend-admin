import { logger } from '../utils/logger';
import { TenantConfigService } from './tenantConfigService';
import { getTenantId } from '../middleware/tenantMiddleware';
import { externalCall } from '../utils/externalAdapter';

type HubSpotConfig = {
   accessToken: string;
   baseUrl?: string;
   defaultOwnerId?: string;
   contactSourceProperty?: string;
   dealPriorityProperty?: string;
   dealsPipelineId?: string;
   dealsPipelineName?: string;
 };
  const DEFAULT_BASE = 'https://api.hubapi.com';
  async function loadConfig(): Promise<HubSpotConfig> {
    const tenantId = getTenantId();
    if (tenantId) {
      try {
        const cfg = await TenantConfigService.getConfig<Partial<HubSpotConfig>>(tenantId, 'hubspot');
        if (cfg?.accessToken) {
          return {
            accessToken: cfg.accessToken,
            baseUrl: cfg.baseUrl || DEFAULT_BASE,
            defaultOwnerId: cfg.defaultOwnerId,
            contactSourceProperty: cfg.contactSourceProperty,
            dealPriorityProperty: cfg.dealPriorityProperty,
            dealsPipelineId: cfg.dealsPipelineId,
            dealsPipelineName: cfg.dealsPipelineName,
          };
        }
      } catch (e) {
        // ignore and throw precondition below
      }
      const err: any = new Error('HubSpot configuration missing');
      err.code = 'HUBSPOT_CONFIG_MISSING';
      throw err;
    }
    const envToken = process.env.HUBSPOT_ACCESS_TOKEN;
    if (!envToken) {
      logger.warn('HubSpot: access token missing (env/tenant); HubSpot sync disabled');
      throw new Error('HUBSPOT_ACCESS_TOKEN missing');
    }
    return {
      accessToken: envToken,
      baseUrl: process.env.HUBSPOT_BASE_URL || DEFAULT_BASE,
      defaultOwnerId: process.env.HUBSPOT_DEFAULT_OWNER_ID,
      contactSourceProperty: process.env.HUBSPOT_CONTACT_SOURCE_PROPERTY,
      dealPriorityProperty: process.env.HUBSPOT_DEAL_PRIORITY_PROPERTY,
      dealsPipelineId: process.env.HUBSPOT_DEALS_PIPELINE_ID,
      dealsPipelineName: process.env.HUBSPOT_DEALS_PIPELINE_NAME,
    };
  }

async function hs<T>(path: string, init: RequestInit = {}): Promise<T> {
  const cfg = await loadConfig();
  const res = await externalCall('hubspot', (signal) => fetch(`${cfg.baseUrl || DEFAULT_BASE}${path}`, {
    ...init,
    signal,
    headers: {
      'Authorization': `Bearer ${cfg.accessToken}`,
      'Content-Type' : 'application/json',
      'Accept'       : 'application/json',
      ...(init.headers || {})
    }
  }));
  if (res.status === 404) {
    // @ts-ignore
    return null;
  }
  if (!res.ok) {
    const text = await res.text().catch(()=>'');
    throw new Error(`HubSpot ${init.method || 'GET'} ${path} → ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

function splitName(full?: string): { first?: string; last?: string } {
  const s = (full || '').trim();
  if (!s) return {};
  const parts = s.split(/\s+/);
  if (parts.length === 1) return { first: parts[0] };
  const first = parts.shift();
  const last = parts.join(' ');
  return { first, last };
}

export async function getDefaultHubSpotOwnerId(): Promise<string|undefined> {
  const cfg = await loadConfig().catch(() => null);
  return cfg?.defaultOwnerId;
}

export type HubSpotContact = { id: string; properties: Record<string, any> };
export type HubSpotLead    = { id: string; properties: Record<string, any> };
export type HubSpotDeal    = { id: string; properties: Record<string, any> };

const _assocTypeIdByTenant = new Map<string, number | null>();
const _pipelineCacheByTenant = new Map<string, { pipelineId: string; stagesByLabel: Record<string, string> }>();
const _priorityValueCacheByTenant = new Map<string, Record<string, string>>();
const _dealPriorityPropByTenant = new Map<string, string | null>();
const _contactSourcePropByTenant = new Map<string, string | null>();

export class HubSpotService {
  static async getContactByEmail(email: string): Promise<HubSpotContact|null> {
    const base = `/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email`;
    const props = ['email','firstname','lastname','phone'].map(p => `properties=${encodeURIComponent(p)}`).join('&');
    return hs<HubSpotContact>(`${base}&${props}`);
  }

  static async createContact(props: Record<string, any>): Promise<HubSpotContact> {
    return hs<HubSpotContact>('/crm/v3/objects/contacts', {
      method: 'POST',
      body: JSON.stringify({ properties: props }),
    });
  }

  static async updateContactByEmail(email: string, props: Record<string, any>): Promise<HubSpotContact> {
    return hs<HubSpotContact>(`/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email`, {
      method: 'PATCH',
      body: JSON.stringify({ properties: props }),
    });
  }

  static async ensureContact(params: {
    email: string;
    name?: string;
    phone?: string;
    ownerId?: string;
  }): Promise<HubSpotContact> {
    const { email, name, phone } = params;
    const cfg = await loadConfig().catch(() => null);
    const ownerId = params.ownerId || cfg?.defaultOwnerId;
    let formattedPhone: string | undefined;
    if (phone) {
      const digits = phone.replace(/\D/g, '');
      formattedPhone = digits.length > 10
        ? '+' + digits
        : digits;
    }
    const existing = await this.getContactByEmail(email);
    const { first, last } = splitName(name);
    if (!existing) {
      const props: Record<string, any> = {
        email,
        ...(first ? { firstname: first } : {}),
        ...(last  ? { lastname:  last } : {}),
        ...(phone ? { phone: formattedPhone } : {}),
        lifecyclestage: 'lead'
      };
      if (ownerId) props.hubspot_owner_id = ownerId;
      try {
        const sourceProp = await this.getContactSourcePropertyName();
        if (sourceProp) {
          if (sourceProp === 'contact_source') {
            props[sourceProp] = 'LTT_WEBSITE';
          } else {
            const optVal = await this.resolvePropertyOptionValue('contacts', sourceProp, 'LTT_WEBSITE');
            if (optVal) {
              props[sourceProp] = optVal;
            } else {
              logger.warn(
                `HubSpot contact source property '${sourceProp}' has no option matching 'LTT_WEBSITE'; skipping source set`
              );
            }
          }
        } else {
          logger.warn('HubSpot contact source property not found; skipping source set');
        }
      } catch (e) {
        logger.warn(`Error resolving contact source property; skipping source set: ${String((e as Error)?.message || e)}`);
      }
      return this.createContact(props);
    }
    const toUpdate: Record<string, any> = {};
    if (first && existing.properties?.firstname !== first) toUpdate.firstname = first;
    if (last  && existing.properties?.lastname  !== last)  toUpdate.lastname  = last;
    if (formattedPhone && existing.properties?.phone !== formattedPhone) {
      toUpdate.phone = formattedPhone;
    }
    if (Object.keys(toUpdate).length === 0) return existing;
    return this.updateContactByEmail(email, toUpdate);
  }

  /**
   * Return the option 'value' for a given property where either the label or value
   * matches 'desired' (case-insensitive). Works for single/multi-select properties.
   */
  private static async resolvePropertyOptionValue(
    object: 'contacts'|'deals'|'companies'|'tickets',
    property: string,
    desired: string
  ): Promise<string|null> {
    const prop = await hs<any>(`/crm/v3/properties/${object}/${encodeURIComponent(property)}`).catch(() => null);
    const options = prop?.options || [];
    const needle = (desired || '').toLowerCase();
    const match = options.find((o: any) =>
      (o?.value || '').toLowerCase() === needle ||
      (o?.label || '').toLowerCase() === needle
    );
    return match?.value ?? null;
  }

  private static async getContactSourcePropertyName(): Promise<string | null> {
    const tid = getTenantId() || 'default';
   if (_contactSourcePropByTenant.has(tid)) return _contactSourcePropByTenant.get(tid)!;
   const cfg = await loadConfig();
   const override = cfg.contactSourceProperty || process.env.HUBSPOT_CONTACT_SOURCE_PROPERTY;

    const getProp = async (prop: string) =>
      await hs<any>(`/crm/v3/properties/contacts/${encodeURIComponent(prop)}`).catch(() => null);
    if (override) {
      const p = await getProp(override);
      const ro = p?.modificationMetadata?.readOnlyValue;
      const archived = p?.archived === true;
      if (p && !ro && !archived) {
        _contactSourcePropByTenant.set(tid, override);
       return override;
      }
    }
    for (const candidate of ['contact_source', 'source', 'hs_lead_source']) {
      const p = await getProp(candidate);
      const ro = p?.modificationMetadata?.readOnlyValue;
      const archived = p?.archived === true;
      if (p && !ro && !archived) {
        _contactSourcePropByTenant.set(tid, candidate);
        return candidate;
      }
    }
    _contactSourcePropByTenant.set(tid, null);
    return null;
  }

  private static async resolveDealPriorityValue(
    label: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH'
  ): Promise<string | null> {
    const priorityProp = await this.getDealPriorityPropertyName();
    if (!priorityProp) return null;
    const tid = getTenantId() || 'default';
    let cache = _priorityValueCacheByTenant.get(tid);
    if (!cache) {
      const prop = await hs<any>(`/crm/v3/properties/deals/${encodeURIComponent(priorityProp)}`).catch(() => null);
      const ro = prop?.modificationMetadata?.readOnlyValue;
      const archived = prop?.archived === true;
      cache = {};
      if (!prop || ro || archived) { _priorityValueCacheByTenant.set(tid, cache); return null; }

      for (const opt of prop?.options || []) {
        const keyLabel = (opt.label || '').toLowerCase();
        const keyValue = (opt.value || '').toLowerCase();
        if (keyLabel) cache[keyLabel] = opt.value;
        if (keyValue) cache[keyValue] = opt.value;
      }
      _priorityValueCacheByTenant.set(tid, cache);
    }
    const key = label.toLowerCase();
    return (cache && cache[key]) || null;
  }

  private static async getDealPriorityPropertyName(): Promise<string | null> {
    const tid = getTenantId() || 'default';
    if (_dealPriorityPropByTenant.has(tid)) return _dealPriorityPropByTenant.get(tid)!;
    const cfg = await loadConfig();
    const override = cfg.dealPriorityProperty || process.env.HUBSPOT_DEAL_PRIORITY_PROPERTY;
    const check = async (name: string) =>
      await hs<any>(`/crm/v3/properties/deals/${encodeURIComponent(name)}`).catch(() => null);
    if (override) {
      const p = await check(override);
      const ro = p?.modificationMetadata?.readOnlyValue;
      const archived = p?.archived === true;
      if (p && !ro && !archived) { _dealPriorityPropByTenant.set(tid, override); return override; } 
    }
    // Default internal name of the built-in Priority property on Deals.
    for (const candidate of ['hs_priority', 'priority']) {
      const p = await check(candidate);
      const ro = p?.modificationMetadata?.readOnlyValue;
      const archived = p?.archived === true;
      if (p && !ro && !archived) { _dealPriorityPropByTenant.set(tid, candidate); return candidate; }
    }
    _dealPriorityPropByTenant.set(tid, null);
    return null;
  }

  private static async resolveDealPipelineAndStages(): Promise<{ pipelineId: string; stagesByLabel: Record<string, string> }> {
    const tid = getTenantId() || 'default';
    const cached = _pipelineCacheByTenant.get(tid);
    if (cached) return cached;
    const cfg = await loadConfig();
    const desiredLabel = cfg.dealsPipelineName || process.env.HUBSPOT_DEALS_PIPELINE_NAME || 'Lead Management';
    let pipelineId = cfg.dealsPipelineId || process.env.HUBSPOT_DEALS_PIPELINE_ID || null;

    if (!pipelineId) {
      const list = await hs<any>('/crm/v3/pipelines/deals');
      const found =
        (list?.results || []).find((p: any) => (p.label || '').toLowerCase() === desiredLabel.toLowerCase()) ||
        (list?.results || [])[0];
      pipelineId = found?.id || null;
    }
    if (!pipelineId) throw new Error('Could not resolve HubSpot deals pipeline');
    const stagesResp = await hs<any>(`/crm/v3/pipelines/deals/${pipelineId}/stages`);
    const stagesByLabel: Record<string, string> = {};
    for (const st of stagesResp?.results || []) {
      if (st?.label && st?.id) stagesByLabel[(st.label as string).toLowerCase()] = st.id as string;
    }
    const value = { pipelineId, stagesByLabel };
    _pipelineCacheByTenant.set(tid, value);
    return value;
  }

  private static async getDealToContactAssociationTypeId(): Promise<number | null> {
    const tid = getTenantId() || 'default';
    if (_assocTypeIdByTenant.has(tid)) return _assocTypeIdByTenant.get(tid)!;
    const resp = await hs<any>('/crm/v4/associations/deal/contact/labels').catch(() => null);
    const results = Array.isArray(resp?.results) ? resp.results : [];
    const hubspotDefined = results.filter((r: any) => r?.category === 'HUBSPOT_DEFINED');
    const unlabeled = hubspotDefined.find((r: any) => r?.label == null);
    const primary   = hubspotDefined.find((r: any) => String(r?.label).toLowerCase().includes('primary'));
    const chosen    = unlabeled || primary || hubspotDefined[0];
    if (!chosen?.typeId) {
      logger.warn('Could not resolve a HUBSPOT_DEFINED deal↔contact association typeId; skipping association on deal create');
      _assocTypeIdByTenant.set(tid, null);
      return null;
    }
    _assocTypeIdByTenant.set(tid, chosen.typeId);
    return chosen.typeId;
  }

  /**
   * Fetch the association-type ID for note↔deal links.
   */
  private static async getDealToNoteAssociationTypeId(): Promise<number> {
    const resp = await hs<any>('/crm/v4/associations/note/deal/labels');
    const labels = Array.isArray(resp?.results) ? resp.results : [];
    // find the default (unlabeled) HUBSPOT_DEFINED entry
    const found = labels.find((l: any) => l.category === 'HUBSPOT_DEFINED' && !l.label)
               || labels.find((l: any) => l.category === 'HUBSPOT_DEFINED');
    if (!found || typeof found.typeId !== 'number') {
      throw new Error('Could not resolve note↔deal association typeId');
    }
    return found.typeId;
  }

  /**
   * Create a Deal linked to a Contact.
   * Required props: dealname, pipeline, dealstage
   */
  static async createDealForContact(params: {
    contactId: string;
    dealName: string;
    stageLabel: string;
    ownerId?: string;
    dealType?: 'newbusiness' | 'existingbusiness';
    amount?: number;
    priorityLabel?: 'HIGH' | 'MEDIUM' | 'LOW';
    properties?: Record<string, any>;
  }): Promise<HubSpotDeal> {
    const { contactId, dealName, stageLabel, dealType, amount, priorityLabel, properties } = params;
    const cfg = await loadConfig().catch(() => null);
    const ownerId = (params as any).ownerId ?? cfg?.defaultOwnerId;
    const { pipelineId, stagesByLabel } = await this.resolveDealPipelineAndStages();
    const stageId = stagesByLabel[stageLabel.toLowerCase()];
    if (!stageId) throw new Error(`HubSpot deal stage not found by label: ${stageLabel}`);
    const props: Record<string, any> = {
      dealname: dealName,
      pipeline: pipelineId,
      dealstage: stageId,
      ...(ownerId ? { hubspot_owner_id: ownerId } : {}),
      ...(dealType ? { dealtype: dealType } : {}),
      ...(typeof amount !== 'undefined' ? { amount: String(amount) } : {}),
    };
    if (priorityLabel) {
      const propName = await this.getDealPriorityPropertyName();
      if (propName) {
        const priorityValue = await this.resolveDealPriorityValue(priorityLabel);
        if (priorityValue) {
          props[propName] = priorityValue;
        } else {
          logger.warn('HubSpot deal priority option not found; skipping priority set', { priorityLabel });
        }
      } else {
        logger.warn('HubSpot deal priority property not found; skipping priority set');
      }
    }
    const assocTypeId = await this.getDealToContactAssociationTypeId();
    const body: any = { properties: props };
    if (assocTypeId != null) {
      body.associations = [
        {
          to: { id: contactId },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: assocTypeId }]
        }
      ];
    } else {
      logger.warn('Skipping deal↔contact association on create; association typeId not resolved');
    }
    const deal = await hs<HubSpotDeal>('/crm/v3/objects/deals', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    if (properties) {
      const noteBody = Object.entries(properties)
        .map(([key, value]) => {
          const label = ({
            bookingCode:      'Booking Reference',
            productCode:      'Product Code',
            bookingDate:      'Booking Date',
            currency:         'Currency',
            totalAmount:      'Total Amount',
            adults:           'Adults',
            children:         'Children',
            couponCode:       'Coupon Code',
            discountAmount:   'Discount Amount',
            notes:            'Notes',
            destination:      'Destination',
            startDate:        'Start Date',
            endDate:          'End Date',
            budget:           'Budget',
            interests:        'Interests',
            accommodation:    'Accommodation',
            transport:        'Transport',
            specialRequests:  'Special Requests',
            recoverToken:     'Recovery Token',
            customerData:     'Customer Data',
            paymentId:        'Payment Transaction ID',
            paymentAmount:    'Payment Amount',
            paymentMethod:    'Payment Method',
          }[key]) || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());

          let display: string;
          if (Array.isArray(value)) {
            display = (value as any[]).join('; ');
          } else if (typeof value === 'object' && value !== null) {
            display = JSON.stringify(value, null, 2);
          } else {
            display = String(value);
          }

          return `* ${label}: ${display}`;
        })
        .join('\n');
      await hs('/crm/v3/objects/notes', {
        method: 'POST',
        body: JSON.stringify({
          properties: {
            hs_note_body: noteBody,
            hubspot_owner_id: ownerId,
            hs_timestamp: new Date().toISOString()
          },
          associations: [
            {
              to: { id: deal.id },
              types: [
                {
                  associationCategory: 'HUBSPOT_DEFINED',
                  associationTypeId: await this.getDealToNoteAssociationTypeId()
                }
              ]
            }
          ]
        })
      });
    }
    return deal;
  }
}