---
name: ordenes-compra
description: Conocimiento del proceso de órdenes de compra que el agente consulta para explicar controles y excepciones.
---

# Órdenes de compra

La analista recibe un correo con la solicitud, la cotización y la aprobación del líder. El agente prepara la orden de compra y la crea en el SAP simulado solo si los controles lo permiten.

Controles:
- RC1 a RC4 y RC10 bloquean. No hay orden.
- RC5, RC6, RC8 y RC9 piden confirmación humana.
- RC7 solo informa un derivado.
- RC3 no se evalúa si RC2 no encontró un aprobador del centro.
- Una factura con fecha anterior a la solicitud marca la orden como retroactiva. Se mide; no se rechaza por política.

La descripción de la posición se recorta a 40 caracteres. La unidad sale del encabezado del ítem: horas es H, mes o mensualidad es MES, el resto es UN.

La evidencia es el correo de aprobación. Su sha256 se calcula sobre el texto canónico (de, para, fecha, asunto, cuerpo), no sobre los bytes del PDF.
