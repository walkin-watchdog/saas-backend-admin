import { AlertTriangle } from 'lucide-react';
import { Button } from './button';
import { ModalWrapper } from './modal-wrapper';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  confirmVariant?: 'default' | 'destructive';
  isLoading?: boolean;
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  confirmVariant = 'destructive',
  isLoading = false
}: ConfirmationModalProps) {

  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="flex items-center space-x-3 mb-4">
        <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
          <AlertTriangle className="h-5 w-5 text-orange-600" />
        </div>
      </div>
      
      <p className="text-muted-foreground mb-6">{description}</p>
      
      <div className="flex justify-end space-x-3">
        <Button variant="outline" onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button 
          variant={confirmVariant} 
          onClick={onConfirm} 
          disabled={isLoading}
        >
          {isLoading ? 'Processing...' : confirmText}
        </Button>
      </div>
    </ModalWrapper>
  );
}