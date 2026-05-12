export function kitchenOrdersSnapshotKey(token: string): string {
  return `kitchen-orders-v1:${token}`;
}

export function publicMenuSnapshotKey(restaurantSlug: string, tableToken: string): string {
  return `public-menu-v1:${restaurantSlug}:${tableToken}`;
}
