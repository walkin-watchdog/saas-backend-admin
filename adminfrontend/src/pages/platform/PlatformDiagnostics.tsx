import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { diagnosticsApi } from '@/api/platform/diagnostics';
import { toast } from '@/hooks/use-toast';

export default function PlatformDiagnostics() {
  const [stats, setStats] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLoad = async () => {
    try {
      setLoading(true);
      const data = await diagnosticsApi.getPrismaCache();
      setStats(data);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to load diagnostics', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prisma Cache Diagnostics</CardTitle>
      </CardHeader>
      <CardContent>
        <Button onClick={handleLoad} disabled={loading}>
          {loading ? 'Loading...' : 'Load Stats'}
        </Button>
        {stats && (
          <pre className="mt-4 text-sm bg-muted p-2 rounded">{JSON.stringify(stats, null, 2)}</pre>
        )}
      </CardContent>
    </Card>
  );
}