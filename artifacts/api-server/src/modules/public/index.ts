export interface PublicTrackingDetails {
  userName: string;
  tripStatus: string;
  lastLat?: number;
  lastLng?: number;
  lastSeenAt?: number;
  isExpired: boolean;
}