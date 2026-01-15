import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GitBranch, Construction } from 'lucide-react';

export function PipelineEditor() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Pipeline Editor</h2>
        <p className="text-sm text-muted-foreground">Visual pipeline stage builder</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="w-5 h-5" />
            Pipeline Builder
          </CardTitle>
          <CardDescription>
            Configure pipeline stages, transitions, and verdicts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Construction className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-center">
              Pipeline visual editor coming soon.
              <br />
              <span className="text-sm">
                This will allow you to visually design pipeline stages and configure agent roles.
              </span>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
