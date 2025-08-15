export function generateComponentBranchId(
  componentId: string,
  branchCode: string,
): string {
  return `${componentId}.${branchCode}`;
}
