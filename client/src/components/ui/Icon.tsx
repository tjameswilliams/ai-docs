import {
  // Editor / actions
  Bold, Italic, Strikethrough, Code, Code2, Link as LinkIcon, Image as ImageIcon,
  Heading1, Heading2, Heading3, List, ListOrdered, ListChecks, Quote, Minus,
  Table as TableIcon, Sigma, FunctionSquare,
  Undo2, Redo2, Download, Upload, FileDown, FileText, FilePlus, Folder, FolderOpen, FolderPlus, File,

  // UI chrome
  Search, Settings, MoreHorizontal, MoreVertical, X, Check, ChevronRight, ChevronDown, ChevronUp,
  Plus, Trash2, Pencil, Copy, ThumbsUp, ThumbsDown, Eye, Send, Paperclip, Mic, Square,
  Sparkles, Wand2, Brain, Cpu, History, RotateCcw, RotateCw,
  CircleDot, Circle, CheckCircle2, XCircle, Loader2, AlertCircle, Info,

  // Misc / layout
  PanelLeft, PanelRight, Type as TypeIcon, Hash, Bell, User, Users, Globe, Command,
  Play, Pause, SkipBack, SkipForward,
} from "lucide-react";

import type { ComponentType, SVGProps } from "react";

// Centralized icon-name → lucide component map. Add aliases freely; the rest
// of the app uses <Icon name="folder" /> so swaps stay in this file.
const ICONS = {
  // Editor formatting
  bold: Bold,
  italic: Italic,
  strike: Strikethrough,
  code: Code,
  "code-block": Code2,
  link: LinkIcon,
  image: ImageIcon,
  h1: Heading1,
  h2: Heading2,
  h3: Heading3,
  ul: List,
  ol: ListOrdered,
  task: ListChecks,
  quote: Quote,
  hr: Minus,
  table: TableIcon,
  math: Sigma,
  "math-block": FunctionSquare,

  // File / project
  folder: Folder,
  "folder-open": FolderOpen,
  "folder-plus": FolderPlus,
  file: File,
  "file-text": FileText,
  "file-plus": FilePlus,
  "file-down": FileDown,
  download: Download,
  upload: Upload,
  export: Upload,

  // History / actions
  undo: Undo2,
  redo: Redo2,
  "rotate-ccw": RotateCcw,
  "rotate-cw": RotateCw,
  history: History,

  // Chrome
  search: Search,
  settings: Settings,
  more: MoreHorizontal,
  "more-v": MoreVertical,
  x: X,
  check: Check,
  "caret-r": ChevronRight,
  "caret-d": ChevronDown,
  "caret-u": ChevronUp,
  caret: ChevronRight,
  plus: Plus,
  minus: Minus,
  trash: Trash2,
  pencil: Pencil,
  copy: Copy,
  "thumbs-up": ThumbsUp,
  "thumbs-down": ThumbsDown,
  eye: Eye,

  // Chat
  send: Send,
  attach: Paperclip,
  mic: Mic,
  stop: Square,
  sparkle: Sparkles,
  wand: Wand2,
  brain: Brain,
  cpu: Cpu,

  // Status / state
  "circle-dot": CircleDot,
  circle: Circle,
  "check-circle": CheckCircle2,
  "x-circle": XCircle,
  loader: Loader2,
  alert: AlertCircle,
  info: Info,

  // Layout
  "panel-left": PanelLeft,
  "panel-right": PanelRight,
  type: TypeIcon,
  hash: Hash,
  bell: Bell,
  user: User,
  users: Users,
  globe: Globe,
  command: Command,
  play: Play,
  pause: Pause,
  "skip-back": SkipBack,
  "skip-fwd": SkipForward,
} as const satisfies Record<string, ComponentType<SVGProps<SVGSVGElement>>>;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 14, className, strokeWidth = 1.75 }: IconProps) {
  const Cmp = ICONS[name];
  if (!Cmp) return null;
  return <Cmp size={size} strokeWidth={strokeWidth} className={className} />;
}
