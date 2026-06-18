import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventBusService } from '../../common/events/event-bus.service';
import { decrementInventoryForShipment } from '../stock/stock-atomic.util';
import {
  CreateShipmentFromOrderDto,
  PickItemDto,
  HandoverShipmentDto,
  CancelShipmentDto,
} from './shipments.dto';
import { OrderStatus, MovementType, ShipmentStatus } from '@prisma/client';

@Injectable()
export class ShipmentsService {
  private readonly logger = new Logger(ShipmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  /**
   * Tạo phiếu xuất kho từ đơn hàng từ hina-e-comm.
   * Lấy orderItems → tạo shipment items với snapshot.
   * Được trigger bởi:
   *  - Webhook từ hina-e-comm (khi order CONFIRMED)
   *  - Hoặc thủ công bởi admin
   */
  async createFromOrder(dto: CreateShipmentFromOrderDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: {
        items: true,
      },
    });

    if (!order) throw new NotFoundException(`Không tìm thấy đơn hàng ${dto.orderId}`);
    if (order.items.length === 0) {
      throw new BadRequestException('Đơn hàng không có sản phẩm');
    }

    // Kiểm tra đã tạo shipment chưa
    const existing = await this.prisma.outboundShipment.findUnique({
      where: { orderId: dto.orderId },
    });
    if (existing) return existing;

    // Lấy warehouseId
    let warehouseId = dto.warehouseId;
    if (!warehouseId) {
      const defaultWh = await this.prisma.warehouse.findFirst({
        where: { isDefault: true, isActive: true },
      });
      if (!defaultWh) {
        throw new BadRequestException('Chưa cấu hình kho mặc định');
      }
      warehouseId = defaultWh.id;
    }

    const shipmentNumber = await this.generateShipmentNumber();

    return this.prisma.outboundShipment.create({
      data: {
        shipmentNumber,
        orderId: order.id,
        orderNumber: order.orderNumber,
        warehouseId,
        status: ShipmentStatus.PENDING,
        items: {
          create: order.items.map((it) => ({
            productId: it.productId,
            variantId: it.variantId,
            productCode: it.productCode,
            productName: it.variantName
              ? `${it.productName} - ${it.variantName}`
              : it.productName,
            sku: it.sku,
            orderQuantity: it.quantity,
            pickedQuantity: 0,
            packedQuantity: 0,
          })),
        },
      },
      include: { items: true },
    });
  }

  /**
   * Bắt đầu pick (PENDING → PICKING)
   */
  async startPick(userId: string, shipmentId: string) {
    const staffId = await this.getStaffId(userId);
    const shipment = await this.prisma.outboundShipment.findUnique({
      where: { id: shipmentId },
    });
    if (!shipment) throw new NotFoundException('Không tìm thấy phiếu xuất');
    if (shipment.status !== ShipmentStatus.PENDING) {
      throw new BadRequestException(`Trạng thái không hợp lệ: ${shipment.status}`);
    }

    return this.prisma.outboundShipment.update({
      where: { id: shipmentId },
      data: { status: ShipmentStatus.PICKING, pickedById: staffId },
    });
  }

  /**
   * Pick 1 sản phẩm (quét barcode xác nhận)
   * - Tăng pickedQuantity
   * - Khi đủ pickedQuantity = orderQuantity → tự động trừ inventory
   */
  async pickItem(userId: string, dto: PickItemDto) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.outboundShipmentItem.findUnique({
        where: { id: dto.itemId },
        include: { shipment: true },
      });
      if (!item) throw new NotFoundException('Không tìm thấy item');
      if (item.shipment.status !== ShipmentStatus.PICKING) {
        throw new BadRequestException('Phiếu chưa ở trạng thái PICKING');
      }

      const newPicked = item.pickedQuantity + dto.pickedQuantity;
      if (newPicked > item.orderQuantity) {
        throw new BadRequestException(
          `Số lượng pick vượt quá yêu cầu (${item.orderQuantity})`,
        );
      }

      // Nếu đã đủ → tự động trừ tồn
      let isFullyPicked = false;
      if (newPicked === item.orderQuantity) {
        isFullyPicked = true;
        await decrementInventoryForShipment(
          tx,
          item.variantId
            ? { productId: item.productId!, variantId: item.variantId }
            : { productId: item.productId! },
          item.orderQuantity,
        );

        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            variantId: item.variantId,
            type: MovementType.ORDER_SHIPMENT,
            quantity: -item.orderQuantity,
            reference: item.shipment.shipmentNumber,
            note: `Xuất kho cho đơn ${item.shipment.orderNumber}`,
            warehouseStaffId: await this.getStaffId(userId),
          },
        });
      }

      return tx.outboundShipmentItem.update({
        where: { id: item.id },
        data: { pickedQuantity: newPicked },
      });
    });
  }

  /**
   * Hoàn tất pick (PICKING → PICKED)
   * Validate tất cả items đã pick đủ
   */
  async completePick(shipmentId: string) {
    return this.prisma.$transaction(async (tx) => {
      const shipment = await tx.outboundShipment.findUnique({
        where: { id: shipmentId },
        include: { items: true },
      });
      if (!shipment) throw new NotFoundException('Không tìm thấy phiếu xuất');
      if (shipment.status !== ShipmentStatus.PICKING) {
        throw new BadRequestException(`Trạng thái không hợp lệ: ${shipment.status}`);
      }

      const incomplete = shipment.items.filter(
        (it) => it.pickedQuantity < it.orderQuantity,
      );
      if (incomplete.length > 0) {
        throw new BadRequestException(
          `Còn ${incomplete.length} sản phẩm chưa pick đủ: ${incomplete
            .map((it) => it.productCode)
            .join(', ')}`,
        );
      }

      const updated = await tx.outboundShipment.update({
        where: { id: shipmentId },
        data: { status: ShipmentStatus.PICKED, pickedAt: new Date() },
      });

      // Publish event stock.changed
      setImmediate(() => {
        this.eventBus.publish('stock.changed', {
          shipmentNumber: updated.shipmentNumber,
          orderId: updated.orderId,
          warehouseId: updated.warehouseId,
        }, updated.warehouseId);
      });

      return updated;
    });
  }

  /**
   * Bàn giao cho carrier (PICKED → HANDED_OVER)
   * Đồng thời cập nhật order status PROCESSING → DELIVERED trên hina-e-comm
   */
  async handover(dto: HandoverShipmentDto) {
    const shipment = await this.prisma.outboundShipment.findUnique({
      where: { id: dto.shipmentId },
    });
    if (!shipment) throw new NotFoundException('Không tìm thấy phiếu xuất');
    if (shipment.status === ShipmentStatus.HANDED_OVER) {
      throw new BadRequestException('Phiếu đã bàn giao rồi');
    }
    if (shipment.status === ShipmentStatus.CANCELLED) {
      throw new BadRequestException('Phiếu đã bị hủy, không thể bàn giao');
    }
    if (shipment.status !== ShipmentStatus.PICKED && shipment.status !== ShipmentStatus.PACKED) {
      throw new BadRequestException(
        `Cần hoàn tất pick/đóng gói trước khi bàn giao. Hiện tại: ${shipment.status}`,
      );
    }

    // CRITICAL: Check if order was cancelled BEFORE updating shipment
    const order = await this.prisma.order.findUnique({
      where: { id: shipment.orderId },
      select: { id: true, status: true, orderNumber: true },
    });
    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng liên quan');
    }
    if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REFUNDED) {
      throw new BadRequestException(
        `Đơn hàng ${order.orderNumber} đã bị hủy (${order.status}). Không thể bàn giao phiếu xuất.`,
      );
    }

    const updated = await this.prisma.outboundShipment.update({
      where: { id: dto.shipmentId },
      data: {
        status: ShipmentStatus.HANDED_OVER,
        handedOverAt: new Date(),
        carrierName: dto.carrierName,
        trackingNumber: dto.trackingNumber,
        note: dto.note,
        packedAt: shipment.packedAt ?? new Date(),
      },
    });

    // Cập nhật order status trên hina-e-comm
    setImmediate(async () => {
      try {
        await this.prisma.order.update({
          where: { id: shipment.orderId },
          data: { status: OrderStatus.DELIVERED },
        });
      } catch (err) {
        this.logger.warn(
          `Không thể cập nhật order status: ${(err as Error).message}`,
        );
      }

      // Publish event shipment.handed_over
      await this.eventBus.publish('shipment.handed_over', {
        shipmentNumber: updated.shipmentNumber,
        orderId: updated.orderId,
        orderNumber: updated.orderNumber,
        warehouseId: updated.warehouseId,
        carrierName: updated.carrierName,
        trackingNumber: updated.trackingNumber,
      }, updated.warehouseId);
    });

    return updated;
  }

  /**
   * Hủy phiếu xuất
   */
  async cancel(dto: CancelShipmentDto) {
    const shipment = await this.prisma.outboundShipment.findUnique({
      where: { id: dto.shipmentId },
      include: { items: true },
    });
    if (!shipment) throw new NotFoundException('Không tìm thấy phiếu xuất');
    if (shipment.status === ShipmentStatus.HANDED_OVER) {
      throw new BadRequestException('Phiếu đã bàn giao, không thể hủy');
    }
    if (shipment.status === ShipmentStatus.CANCELLED) {
      return shipment;
    }

    // Nếu đã pick → restore lại inventory
    const pickedItems = shipment.items.filter((it) => it.pickedQuantity > 0);
    if (pickedItems.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        for (const item of pickedItems) {
          // Restore: tăng quantity lại
          await tx.inventory.update({
            where: item.variantId
              ? { variantId: item.variantId }
              : { productId: item.productId! },
            data: { quantity: { increment: item.pickedQuantity } },
          });

          await tx.inventoryMovement.create({
            data: {
              productId: item.productId,
              variantId: item.variantId,
              type: MovementType.STOCK_RESTORED_ORDER_CANCEL,
              quantity: item.pickedQuantity,
              reference: shipment.shipmentNumber,
              note: `Hoàn tồn do hủy phiếu xuất ${shipment.shipmentNumber}: ${dto.reason ?? ''}`,
            },
          });
        }
      });
    }

    return this.prisma.outboundShipment.update({
      where: { id: dto.shipmentId },
      data: { status: ShipmentStatus.CANCELLED, note: dto.reason },
    });
  }

  /**
   * Lấy danh sách shipments
   */
  async listShipments(params: {
    warehouseId?: string;
    status?: ShipmentStatus;
    pickedById?: string;
    fromDate?: Date;
    toDate?: Date;
    page?: number;
    pageSize?: number;
  }) {
    const { warehouseId, status, pickedById, fromDate, toDate, page = 1, pageSize = 20 } = params;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (warehouseId) where.warehouseId = warehouseId;
    if (status) where.status = status;
    if (pickedById) where.pickedById = pickedById;
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = fromDate;
      if (toDate) where.createdAt.lte = toDate;
    }

    const [items, total] = await Promise.all([
      this.prisma.outboundShipment.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          warehouse: { select: { code: true, name: true } },
          pickedBy: {
            select: {
              employeeCode: true,
              user: { select: { name: true, email: true } },
            },
          },
          _count: { select: { items: true } },
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.outboundShipment.count({ where }),
    ]);

    return {
      items: items.map((s) => ({
        id: s.id,
        shipmentNumber: s.shipmentNumber,
        orderId: s.orderId,
        orderNumber: s.orderNumber,
        warehouse: s.warehouse,
        pickedBy: s.pickedBy,
        status: s.status,
        carrierName: s.carrierName,
        trackingNumber: s.trackingNumber,
        itemCount: s._count.items,
        pickedAt: s.pickedAt,
        packedAt: s.packedAt,
        handedOverAt: s.handedOverAt,
        createdAt: s.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Chi tiết shipment (kèm picklist)
   */
  async getShipment(id: string) {
    const shipment = await this.prisma.outboundShipment.findUnique({
      where: { id },
      include: {
        warehouse: true,
        pickedBy: {
          include: { user: { select: { email: true, name: true } } },
        },
        items: {
          include: {
            product: {
              select: {
                name: true, images: { take: 1, orderBy: { sortOrder: 'asc' } },
              },
            },
            variant: {
              select: {
                name: true, attributes: true,
                images: { take: 1, orderBy: { sortOrder: 'asc' } },
              },
            },
          },
        },
      },
    });
    if (!shipment) throw new NotFoundException('Không tìm thấy phiếu xuất');
    return shipment;
  }

  private async getStaffId(userId: string): Promise<string> {
    const staff = await this.prisma.warehouseStaff.findUnique({
      where: { userId },
    });
    if (!staff) throw new NotFoundException('Không tìm thấy nhân viên kho');
    return staff.id;
  }

  private async generateShipmentNumber(): Promise<string> {
    const today = new Date();
    const yyyymmdd = today.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `SH-${yyyymmdd}-`;

    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const count = await this.prisma.outboundShipment.count({
      where: { createdAt: { gte: startOfDay, lt: endOfDay } },
    });

    const next = String(count + 1).padStart(4, '0');
    return `${prefix}${next}`;
  }
}
