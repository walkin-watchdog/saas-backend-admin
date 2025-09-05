import { useEffect, useState } from 'react';
import { usersApi } from '@/api/platform/users';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface MatrixEntry {
  role: string;
  permissions: string[];
}

export default function PlatformPermissions() {
  const [matrix, setMatrix] = useState<MatrixEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMatrix = async () => {
      try {
        const data = await usersApi.getPermissionMatrix();
        setMatrix(data);
      } catch (err) {
        setError('Failed to fetch permission matrix');
      } finally {
        setIsLoading(false);
      }
    };
    fetchMatrix();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Permission Matrix</h1>
        <p className="text-muted-foreground">View platform roles and their permissions</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Roles & Permissions</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Loading...</p>
          ) : (
            <div className="space-y-4">
              {matrix.map(entry => (
                <div key={entry.role}>
                  <h4 className="font-semibold mb-2">{entry.role}</h4>
                  <div className="flex flex-wrap gap-2">
                    {entry.permissions.map(perm => (
                      <Badge key={perm} variant="secondary">{perm}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
