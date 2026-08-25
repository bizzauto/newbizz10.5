/**
 * Template interpolation for workflow nodes — moved out of
 * workflow-execution.service.ts during §44 refactor so handlers can share it.
 */
export function interpolateTemplate(template: string, vars: any): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path) => {
    const parts = path.split('.');
    let value: any = vars;
    for (const p of parts) {
      value = value?.[p];
    }
    return value !== undefined && value !== null ? String(value) : `{{${path}}}`;
  });
}
