import type { OrdenCompra } from "../core/types.ts"

/**
 * Interfaz canónica del adaptador de SAP, la que define la sección 7.4 del PRD.
 * Es el único punto que habría que reimplementar para pasar del SAP simulado en
 * archivos a OData real, así que la implementación de archivos la importa en vez
 * de declarar su propia copia.
 */
export interface SapAdapter {
  consultarProveedor(nit: string): Promise<{ codigo_sap: string; activo: boolean } | null>
  crearOrden(orden: OrdenCompra): Promise<{ numero_oc: string; fecha: string }>
  buscarOrdenPorReferencia(solicitud_id: string): Promise<{ numero_oc: string; fecha: string } | null>
}
