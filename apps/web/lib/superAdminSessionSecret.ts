export function superAdminSessionSecret(): string {
  return (
    process.env["SUPER_ADMIN_SESSION_SECRET"] ??
    process.env["JWT_SECRET"] ??
    "qrder-super-admin-dev-only-change-me"
  );
}
