import { forwardRef } from 'react';
import { HugeiconsIcon, type HugeiconsProps, type IconSvgElement } from '@hugeicons/react';
import {
  AlertCircleIcon,
  Analytics01Icon,
  ArchiveIcon,
  ArrowLeft02Icon,
  ArrowRight02Icon,
  BanIcon,
  BanknoteIcon,
  BellIcon,
  BellRingIcon,
  Building02Icon,
  Calendar03Icon,
  CalendarCheckIcon,
  CalendarOffIcon,
  CalendarPlusIcon,
  Camera01Icon,
  CancelCircleIcon,
  CheckCheckIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CircleCheckIcon,
  CircleDotIcon,
  CircleIcon,
  Clock01Icon,
  CodeIcon,
  CopyIcon,
  CreditCardIcon,
  Delete02Icon,
  Download01Icon,
  ExternalLinkIcon,
  EyeIcon,
  Facebook01Icon,
  FileClockIcon,
  FileTextIcon,
  FilterIcon,
  Flag02Icon,
  FlaskConicalIcon,
  GlobeIcon,
  HeartPulseIcon,
  HourglassIcon,
  InfoIcon,
  InstagramIcon,
  LayoutDashboardIcon,
  LifebuoyIcon,
  LoaderCircleIcon,
  LockIcon,
  LogOutIcon,
  MapPinIcon,
  MenuIcon,
  MessageCircleIcon,
  MessageSquareIcon,
  MessageSquareWarningIcon,
  MinusIcon,
  NavigationIcon,
  PartyPopperIcon,
  PenLineIcon,
  PhoneIcon,
  PlusIcon,
  PrinterIcon,
  RefreshCwIcon,
  RepeatIcon,
  RotateCcwIcon,
  RulerIcon,
  Search01Icon,
  SendIcon,
  Settings02Icon,
  Share08Icon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  StarIcon,
  Store01Icon,
  Tag01Icon,
  Ticket01Icon,
  TrendingUpIcon,
  TriangleAlertIcon,
  TruckIcon,
  User02Icon,
  UserCheck01Icon,
  UserPlusIcon,
  UserXIcon,
  UsersIcon,
  Wifi01Icon,
  WifiOff01Icon,
  Wrench01Icon,
  XIcon,
} from '@hugeicons/core-free-icons';

// Every icon in the app comes from this file (Hugeicons stroke-rounded set), so a glyph is
// swapped in one place and components never depend on the icon vendor's API.
export type IconProps = Omit<HugeiconsProps, 'icon' | 'altIcon' | 'showAlt'>;

function createIcon(name: string, glyph: IconSvgElement) {
  const Component = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
    <HugeiconsIcon ref={ref} icon={glyph} {...props} />
  ));
  Component.displayName = name;
  return Component;
}

/** Component type for icons passed around as data (nav items, status maps). */
export type Icon = ReturnType<typeof createIcon>;

export const AlertCircle = createIcon('AlertCircle', AlertCircleIcon);
export const AlertTriangle = createIcon('AlertTriangle', TriangleAlertIcon);
export const Archive = createIcon('Archive', ArchiveIcon);
export const ArrowLeft = createIcon('ArrowLeft', ArrowLeft02Icon);
export const ArrowRight = createIcon('ArrowRight', ArrowRight02Icon);
export const Ban = createIcon('Ban', BanIcon);
export const Banknote = createIcon('Banknote', BanknoteIcon);
export const BarChart3 = createIcon('BarChart3', Analytics01Icon);
export const Bell = createIcon('Bell', BellIcon);
export const BellRing = createIcon('BellRing', BellRingIcon);
export const Building2 = createIcon('Building2', Building02Icon);
export const Calendar = createIcon('Calendar', Calendar03Icon);
export const CalendarCheck = createIcon('CalendarCheck', CalendarCheckIcon);
export const CalendarOff = createIcon('CalendarOff', CalendarOffIcon);
export const CalendarPlus = createIcon('CalendarPlus', CalendarPlusIcon);
export const Camera = createIcon('Camera', Camera01Icon);
export const Check = createIcon('Check', CheckIcon);
export const CheckCheck = createIcon('CheckCheck', CheckCheckIcon);
export const CheckCircle2 = createIcon('CheckCircle2', CircleCheckIcon);
export const ChevronDown = createIcon('ChevronDown', ChevronDownIcon);
export const ChevronLeft = createIcon('ChevronLeft', ChevronLeftIcon);
export const ChevronRight = createIcon('ChevronRight', ChevronRightIcon);
export const ChevronUp = createIcon('ChevronUp', ChevronUpIcon);
export const Circle = createIcon('Circle', CircleIcon);
export const CircleCheck = createIcon('CircleCheck', CircleCheckIcon);
export const CircleDot = createIcon('CircleDot', CircleDotIcon);
export const Clock = createIcon('Clock', Clock01Icon);
export const Code2 = createIcon('Code2', CodeIcon);
export const Copy = createIcon('Copy', CopyIcon);
export const CreditCard = createIcon('CreditCard', CreditCardIcon);
export const Download = createIcon('Download', Download01Icon);
export const ExternalLink = createIcon('ExternalLink', ExternalLinkIcon);
export const Eye = createIcon('Eye', EyeIcon);
export const Facebook = createIcon('Facebook', Facebook01Icon);
export const FileClock = createIcon('FileClock', FileClockIcon);
export const FileText = createIcon('FileText', FileTextIcon);
export const Filter = createIcon('Filter', FilterIcon);
export const Flag = createIcon('Flag', Flag02Icon);
export const FlaskConical = createIcon('FlaskConical', FlaskConicalIcon);
export const Globe = createIcon('Globe', GlobeIcon);
export const HeartPulse = createIcon('HeartPulse', HeartPulseIcon);
export const Hourglass = createIcon('Hourglass', HourglassIcon);
export const Info = createIcon('Info', InfoIcon);
export const Instagram = createIcon('Instagram', InstagramIcon);
export const LayoutDashboard = createIcon('LayoutDashboard', LayoutDashboardIcon);
export const LifeBuoy = createIcon('LifeBuoy', LifebuoyIcon);
export const Loader2 = createIcon('Loader2', LoaderCircleIcon);
export const Lock = createIcon('Lock', LockIcon);
export const LogOut = createIcon('LogOut', LogOutIcon);
export const MapPin = createIcon('MapPin', MapPinIcon);
export const Menu = createIcon('Menu', MenuIcon);
export const MessageCircle = createIcon('MessageCircle', MessageCircleIcon);
export const MessageSquare = createIcon('MessageSquare', MessageSquareIcon);
export const MessageSquareWarning = createIcon('MessageSquareWarning', MessageSquareWarningIcon);
export const Minus = createIcon('Minus', MinusIcon);
export const Navigation = createIcon('Navigation', NavigationIcon);
export const PartyPopper = createIcon('PartyPopper', PartyPopperIcon);
export const PenLine = createIcon('PenLine', PenLineIcon);
export const Phone = createIcon('Phone', PhoneIcon);
export const Plus = createIcon('Plus', PlusIcon);
export const Printer = createIcon('Printer', PrinterIcon);
export const RefreshCw = createIcon('RefreshCw', RefreshCwIcon);
export const Repeat = createIcon('Repeat', RepeatIcon);
export const RotateCcw = createIcon('RotateCcw', RotateCcwIcon);
export const Ruler = createIcon('Ruler', RulerIcon);
export const Search = createIcon('Search', Search01Icon);
export const Send = createIcon('Send', SendIcon);
export const Settings = createIcon('Settings', Settings02Icon);
export const Share2 = createIcon('Share2', Share08Icon);
export const ShieldCheck = createIcon('ShieldCheck', ShieldCheckIcon);
export const SlidersHorizontal = createIcon('SlidersHorizontal', SlidersHorizontalIcon);
export const Star = createIcon('Star', StarIcon);
export const Store = createIcon('Store', Store01Icon);
export const Tag = createIcon('Tag', Tag01Icon);
export const Ticket = createIcon('Ticket', Ticket01Icon);
export const Trash2 = createIcon('Trash2', Delete02Icon);
export const TrendingUp = createIcon('TrendingUp', TrendingUpIcon);
export const TriangleAlert = createIcon('TriangleAlert', TriangleAlertIcon);
export const Truck = createIcon('Truck', TruckIcon);
export const User = createIcon('User', User02Icon);
export const UserCheck = createIcon('UserCheck', UserCheck01Icon);
export const UserPlus = createIcon('UserPlus', UserPlusIcon);
export const UserX = createIcon('UserX', UserXIcon);
export const Users = createIcon('Users', UsersIcon);
export const Wifi = createIcon('Wifi', Wifi01Icon);
export const WifiOff = createIcon('WifiOff', WifiOff01Icon);
export const Wrench = createIcon('Wrench', Wrench01Icon);
export const X = createIcon('X', XIcon);
export const XCircle = createIcon('XCircle', CancelCircleIcon);
