import { useEffect, useState } from 'react';
import type { ImageResolutionRule, ImageType } from '@/hooks/useImageRule';
import { ModalWrapper } from '@/components/ui/modal-wrapper';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  imageType: ImageType;
  initialRule: ImageResolutionRule;
  onSave: (rule: ImageResolutionRule) => Promise<void> | void;
}

export function ImageRuleEditor({ isOpen, onClose, imageType, initialRule, onSave }: Props) {
  const [rule, setRule] = useState<ImageResolutionRule>(initialRule);

  useEffect(() => {
    setRule(initialRule);
  }, [initialRule, isOpen]);

  const update = (field: keyof ImageResolutionRule, value: any) => {
    setRule((r) => ({ ...r, [field]: value }));
  };

  const handleSave = () => {
    const prepared: ImageResolutionRule = {
      imageType,
      width: Number(rule.width) || 0,
      height: Number(rule.height) || 0,
    };
    if (rule.fit) prepared.fit = rule.fit as any;
    if (rule.format) prepared.format = rule.format as any;
    if (rule.quality !== undefined) {
      prepared.quality = rule.quality === 'auto' ? 'auto' : Number(rule.quality);
    }
    if (rule.minSource && rule.minSource.width && rule.minSource.height) {
      prepared.minSource = {
        width: Number(rule.minSource.width),
        height: Number(rule.minSource.height),
      };
    } else {
      prepared.minSource = undefined;
    }
    if (rule.thumbnails && rule.thumbnails.length) {
      prepared.thumbnails = rule.thumbnails.map((n) => Number(n));
    }
    if (rule.allowedTypes && rule.allowedTypes.length) {
      prepared.allowedTypes = rule.allowedTypes.filter(Boolean);
    }
    if (rule.maxUploadBytes) {
      prepared.maxUploadBytes = Number(rule.maxUploadBytes);
    }
    onSave(prepared);
  };

  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose} title={`Edit Rule: ${imageType}`} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="width">Width</Label>
            <Input id="width" type="number" value={rule.width} onChange={(e) => update('width', Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="height">Height</Label>
            <Input id="height" type="number" value={rule.height} onChange={(e) => update('height', Number(e.target.value))} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="fit">Fit</Label>
            <Select value={rule.fit || ''} onValueChange={(v) => update('fit', v || undefined)}>
              <SelectTrigger id="fit">
                <SelectValue placeholder="Select fit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cover">cover</SelectItem>
                <SelectItem value="contain">contain</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="format">Format</Label>
            <Select value={rule.format || ''} onValueChange={(v) => update('format', v || undefined)}>
              <SelectTrigger id="format">
                <SelectValue placeholder="Select format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="webp">webp</SelectItem>
                <SelectItem value="jpg">jpg</SelectItem>
                <SelectItem value="png">png</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="quality">Quality (1-100 or 'auto')</Label>
          <Input
            id="quality"
            value={rule.quality ?? ''}
            onChange={(e) => update('quality', e.target.value === '' ? undefined : e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="minWidth">Min Source Width</Label>
            <Input
              id="minWidth"
              type="number"
              value={rule.minSource?.width ?? ''}
              onChange={(e) => {
                const width = Number(e.target.value);
                update('minSource', { width, height: rule.minSource?.height ?? 0 });
              }}
            />
          </div>
          <div>
            <Label htmlFor="minHeight">Min Source Height</Label>
            <Input
              id="minHeight"
              type="number"
              value={rule.minSource?.height ?? ''}
              onChange={(e) => {
                const height = Number(e.target.value);
                update('minSource', { width: rule.minSource?.width ?? 0, height });
              }}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="thumbnails">thumbnails (comma separated)</Label>
          <Input
            id="thumbnails"
            value={(rule.thumbnails || []).join(',')}
            onChange={(e) =>
              update(
                'thumbnails',
                e.target.value
                  .split(',')
                  .map((n) => Number(n.trim()))
                  .filter(Boolean)
              )
            }
          />
        </div>
        <div>
          <Label htmlFor="types">Allowed Types (comma separated)</Label>
          <Input
            id="types"
            value={(rule.allowedTypes || []).join(',')}
            onChange={(e) =>
              update(
                'allowedTypes',
                e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              )
            }
          />
        </div>
        <div>
          <Label htmlFor="maxUpload">Max Upload Bytes</Label>
          <Input
            id="maxUpload"
            type="number"
            value={rule.maxUploadBytes ?? ''}
            onChange={(e) => update('maxUploadBytes', Number(e.target.value))}
          />
        </div>
        <div className="flex justify-end space-x-2 pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </div>
      </div>
    </ModalWrapper>
  );
}