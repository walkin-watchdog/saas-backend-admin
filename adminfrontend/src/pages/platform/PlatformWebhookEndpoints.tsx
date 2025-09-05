import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, ChevronLeft, CheckCircle, XCircle } from 'lucide-react';
import { webhooksApi } from '@/api/platform/webhooks';
import type { WebhookEndpoint } from '@/types/platform';
import { toast } from '@/hooks/use-toast';

export default function PlatformWebhookEndpoints() {
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchEndpoints();
  }, []);

  const fetchEndpoints = async () => {
    try {
      setIsLoading(true);
      const data = await webhooksApi.listEndpoints();
      setEndpoints(data);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to fetch webhook endpoints', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Webhook Endpoints</h1>
          <p className="text-muted-foreground">Configured webhook destinations</p>
        </div>
        <div className="flex space-x-2">
          <Button asChild variant="outline">
            <Link to="/platform/webhooks"><ChevronLeft className="h-4 w-4 mr-2" />Back</Link>
          </Button>
          <Button onClick={fetchEndpoints} disabled={isLoading}>
            <RefreshCw className="h-4 w-4 mr-2" />Refresh
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Endpoints</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Provider</th>
                    <th className="text-left py-3 px-4 font-medium">Kind</th>
                    <th className="text-left py-3 px-4 font-medium">URL</th>
                    <th className="text-left py-3 px-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {endpoints.map(ep => (
                    <tr key={ep.id} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-4">{ep.provider}</td>
                      <td className="py-2 px-4">{ep.kind}</td>
                      <td className="py-2 px-4 break-all">{ep.url}</td>
                      <td className="py-2 px-4">
                        {ep.active ? (
                          <Badge variant="secondary" className="bg-green-100 text-green-800">
                            <CheckCircle className="h-3 w-3 mr-1" />Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-gray-100 text-gray-800">
                            <XCircle className="h-3 w-3 mr-1" />Inactive
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                  {endpoints.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-6 text-muted-foreground">
                        No endpoints found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}