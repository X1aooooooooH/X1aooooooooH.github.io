import { toast } from '../ui/feedback.js?v=r51-ai-modules-20261129';

export function aiToast(message, type, duration) {
  toast(message, type || 'warn', duration || 4200);
}
