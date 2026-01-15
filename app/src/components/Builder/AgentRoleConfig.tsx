import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UserCog, Construction } from 'lucide-react';

export function AgentRoleConfig() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Agent Roles</h2>
        <p className="text-sm text-muted-foreground">Configure agent role assignments per pipeline stage</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="w-5 h-5" />
            Role Configuration
          </CardTitle>
          <CardDescription>
            Map agents to pipeline stages and configure their responsibilities
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Construction className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-center">
              Agent role configuration coming soon.
              <br />
              <span className="text-sm">
                This will allow you to assign agents to specific pipeline stages and define their roles.
              </span>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
