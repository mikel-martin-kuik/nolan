import { useEffect, useState, useRef } from 'react';
import { useTerminalStore } from '@/store/terminalStore';
import { TerminalView } from './TerminalView';
import { invoke } from '@/lib/api';
import { X, ExternalLink, Maximize2, Minimize2, Plus, Minus } from 'lucide-react';
import { FEATURES } from '@/lib/features';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';

interface Dimensions {
  width: number;
  height: number;
}

interface ResizeState {
  isResizing: boolean;
  handle: string | null;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
}

const SIZE_PRESETS = {
  small: { width: 800, height: 600 },
  medium: { width: 1280, height: 800 },
  large: { width: 1600, height: 1000 },
};

/**
 * Full-screen terminal modal with resizable, fullscreen, and zoom capabilities
 *
 * Features:
 * - Draggable resize handles on all edges and corners
 * - Fullscreen toggle
 * - Size presets (Small, Medium, Large)
 * - Font size zoom controls
 * - Persistent size and font preferences to localStorage
 * - Keyboard shortcuts: Esc to close, F11 to fullscreen
 */
export function TerminalModal() {
  const { selectedSession, agentName, closeModal } = useTerminalStore();
  const modalRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeState, setResizeState] = useState<ResizeState>({
    isResizing: false,
    handle: null,
    startX: 0,
    startY: 0,
    startWidth: 0,
    startHeight: 0,
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fontSize, setFontSize] = useState(13);
  const [sizePreset, setSizePreset] = useState('');
  const [dimensions, setDimensions] = useState<Dimensions>({
    width: 1600, // Increased default from 1280 (max-w-6xl)
    height: window.innerHeight * 0.85, // Increased from 0.8
  });

  // Load preferences from localStorage
  useEffect(() => {
    const savedSize = localStorage.getItem('nolan-terminal-size');
    if (savedSize) {
      try {
        setDimensions(JSON.parse(savedSize));
      } catch (e) {
        console.error('Failed to parse saved terminal size:', e);
      }
    }

    const savedFontSize = localStorage.getItem('nolan-terminal-font-size');
    if (savedFontSize) {
      try {
        const size = parseInt(savedFontSize, 10);
        if (size >= 8 && size <= 24) {
          setFontSize(size);
        }
      } catch (e) {
        console.error('Failed to parse saved font size:', e);
      }
    }
  }, []);

  // Save dimensions to localStorage
  useEffect(() => {
    if (!isFullscreen) {
      localStorage.setItem('nolan-terminal-size', JSON.stringify(dimensions));
    }
  }, [dimensions, isFullscreen]);

  // Save font size to localStorage
  useEffect(() => {
    localStorage.setItem('nolan-terminal-font-size', fontSize.toString());
  }, [fontSize]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!selectedSession) return;

    const handleKeydown = (e: KeyboardEvent) => {
      // Esc to close
      if (e.key === 'Escape') {
        if (!isResizing) {
          closeModal();
        }
        setIsResizing(false);
      }

      // F11 to toggle fullscreen
      if (e.key === 'F11') {
        e.preventDefault();
        setIsFullscreen(!isFullscreen);
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [selectedSession, closeModal, isResizing, isFullscreen]);

  // Handle mouse drag for resize
  useEffect(() => {
    if (!resizeState.isResizing || !resizeState.handle) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizeState.startX;
      const deltaY = e.clientY - resizeState.startY;

      let newWidth = resizeState.startWidth;
      let newHeight = resizeState.startHeight;

      // Handle different resize directions
      const handle = resizeState.handle;
      if (handle && handle.includes('right')) {
        newWidth = Math.max(400, Math.min(window.innerWidth - 20, resizeState.startWidth + deltaX));
      }
      if (handle && handle.includes('left')) {
        newWidth = Math.max(400, Math.min(window.innerWidth - 20, resizeState.startWidth - deltaX));
      }
      if (handle && handle.includes('bottom')) {
        newHeight = Math.max(300, Math.min(window.innerHeight - 20, resizeState.startHeight + deltaY));
      }
      if (handle && handle.includes('top')) {
        newHeight = Math.max(300, Math.min(window.innerHeight - 20, resizeState.startHeight - deltaY));
      }

      setDimensions({ width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setResizeState({ ...resizeState, isResizing: false });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizeState]);

  if (!selectedSession || !agentName || !FEATURES.EMBEDDED_TERMINAL) {
    return null;
  }

  const handleOpenExternal = async () => {
    try {
      await invoke('open_agent_terminal', { session: selectedSession });
    } catch (err) {
      console.error('Failed to open external terminal:', err);
    }
  };

  const handleStartResize = (handle: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (!modalRef.current) return;

    setResizeState({
      isResizing: true,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: dimensions.width,
      startHeight: dimensions.height,
    });
    setIsResizing(true);
  };

  const handlePresetSize = (preset: Dimensions) => {
    setDimensions(preset);
  };

  const handleFontSizeChange = (delta: number) => {
    const newSize = Math.max(8, Math.min(24, fontSize + delta));
    setFontSize(newSize);
  };

  // Resize handles
  const ResizeHandles = !isFullscreen && (
    <>
      {/* Corners */}
      <div
        onMouseDown={(e) => handleStartResize('top-left', e)}
        className="absolute top-0 left-0 w-2 h-2 cursor-nwse-resize opacity-0 hover:opacity-100 bg-blue-500 rounded-full"
        title="Drag to resize"
      />
      <div
        onMouseDown={(e) => handleStartResize('top-right', e)}
        className="absolute top-0 right-0 w-2 h-2 cursor-nesw-resize opacity-0 hover:opacity-100 bg-blue-500 rounded-full"
        title="Drag to resize"
      />
      <div
        onMouseDown={(e) => handleStartResize('bottom-left', e)}
        className="absolute bottom-0 left-0 w-2 h-2 cursor-nesw-resize opacity-0 hover:opacity-100 bg-blue-500 rounded-full"
        title="Drag to resize"
      />
      <div
        onMouseDown={(e) => handleStartResize('bottom-right', e)}
        className="absolute bottom-0 right-0 w-2 h-2 cursor-nwse-resize opacity-0 hover:opacity-100 bg-blue-500 rounded-full"
        title="Drag to resize"
      />

      {/* Edges */}
      <div
        onMouseDown={(e) => handleStartResize('top', e)}
        className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 cursor-ns-resize opacity-0 hover:opacity-100 bg-blue-500"
        title="Drag to resize"
      />
      <div
        onMouseDown={(e) => handleStartResize('bottom', e)}
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 cursor-ns-resize opacity-0 hover:opacity-100 bg-blue-500"
        title="Drag to resize"
      />
      <div
        onMouseDown={(e) => handleStartResize('left', e)}
        className="absolute top-1/2 left-0 -translate-y-1/2 h-12 w-1 cursor-ew-resize opacity-0 hover:opacity-100 bg-blue-500"
        title="Drag to resize"
      />
      <div
        onMouseDown={(e) => handleStartResize('right', e)}
        className="absolute top-1/2 right-0 -translate-y-1/2 h-12 w-1 cursor-ew-resize opacity-0 hover:opacity-100 bg-blue-500"
        title="Drag to resize"
      />
    </>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        ref={modalRef}
        className={`bg-background border border-border rounded-lg flex flex-col relative ${isResizing ? 'select-none' : ''}`}
        style={
          isFullscreen
            ? { width: '100vw', height: '100vh', maxWidth: 'none', maxHeight: 'none' }
            : {
                width: `${dimensions.width}px`,
                height: `${dimensions.height}px`,
                maxWidth: '95vw',
                maxHeight: '95vh',
              }
        }
      >
        {/* Resize handles */}
        {ResizeHandles}

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg font-semibold truncate">{agentName}</span>
            <span className="text-sm text-muted-foreground truncate">
              {selectedSession}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Font Size Controls */}
            <div className="flex items-center gap-1 border border-border rounded px-2 py-1">
              <button
                onClick={() => handleFontSizeChange(-1)}
                className="p-1 hover:bg-secondary rounded transition-colors"
                title="Decrease font size"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="text-xs w-8 text-center">{fontSize}px</span>
              <button
                onClick={() => handleFontSizeChange(1)}
                className="p-1 hover:bg-secondary rounded transition-colors"
                title="Increase font size"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Size Presets */}
            <Select
              value={sizePreset}
              onValueChange={(value) => {
                const preset = SIZE_PRESETS[value as keyof typeof SIZE_PRESETS];
                if (preset) {
                  handlePresetSize(preset);
                }
                setSizePreset('');
              }}
            >
              <SelectTrigger className="w-auto text-xs h-8" title="Choose preset size">
                <SelectValue placeholder="Size" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="small">Small (800×600)</SelectItem>
                <SelectItem value="medium">Medium (1280×800)</SelectItem>
                <SelectItem value="large">Large (1600×1000)</SelectItem>
              </SelectContent>
            </Select>

            {/* Fullscreen Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title="Toggle fullscreen (F11)"
              className="h-8 w-8"
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </Button>

            {/* Open External */}
            {FEATURES.EXTERNAL_TERMINAL && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleOpenExternal}
                title="Open in external terminal"
              >
                <ExternalLink />
                <span className="hidden sm:inline">External</span>
              </Button>
            )}

            {/* Close */}
            <Button
              variant="ghost"
              size="icon"
              onClick={closeModal}
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Terminal View */}
        <div className="flex-1 overflow-hidden">
          <TerminalView
            session={selectedSession}
            agentName={agentName}
            fontSize={fontSize}
          />
        </div>
      </div>
    </div>
  );
}
