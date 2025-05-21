import { decode, encode } from '@msgpack/msgpack'
import { MAX_BUFFER } from '@lib/tcp-transport/constants'

/** Версия сетевого протокола (при изменении формата сообщений повышать) */
const protocolVersion = 1

/**
 * Сериализуем объект в MessagePack и упаковываем в length-prefixed фрейм:
 *
 * [4 байта length][1 байт version][payload…]
 */
export function encodeFrame(obj: unknown): Buffer {
	/* Кодируем объект в MessagePack */
	const body = Buffer.from(encode(obj))
	/* Резервируем 4 байта под поле длины, 1 байт под версию + длинна тела */
	const frame = Buffer.allocUnsafe(4 + 1 + body.length)

	/* Записываем (body.length + 1) в первые 4 байта (UInt32BE) */
	frame.writeUInt32BE(body.length + 1, 0)
	/* Записываем версию протокола в пятый байт */
	frame.writeUInt8(protocolVersion, 4)

	/* Копируем тело сразу после служебных 5-ти байт */
	body.copy(frame, 5)

	return frame
}

/**
 * Собирает и декодирует фреймы из TCP-буфера
 *
 * Один FrameDecoderService = один сокет
 */
export class FrameDecoderService {
	private buffer = Buffer.alloc(0)

	/** Полностью сбрасывает накопленный буфер */
	reset() {
		this.buffer = Buffer.alloc(0)
	}

	/**
	 * Добавляем новый чанк в буфер
	 *
	 * Возвращает список полностью собранных сообщений (декодированных), если полное сообщение ещё не собрано - сохраняем хвост и возвращаем пустой массив */
	push(chunk: Buffer): unknown[] {
		/* Конкатенируем новый кусок с уже существующими данными */
		this.buffer = this.buffer.length
			? Buffer.concat([this.buffer, chunk], this.buffer.length + chunk.length)
			: chunk

		/* Защита от переполнения (OOM/DDoS) */
		if (this.buffer.length > MAX_BUFFER) {
			throw new Error('Inbound buffer overflow')
		}

		const messages: unknown[] = []

		/** в 5 версии закодирована версия + длина тела запроса */
		/* Пока в буфере есть хотя бы 4 байта (для чтения UInt32BE) */
		while (this.buffer.length >= 4) {
			/* Читаем длину фрейма */
			const len = this.buffer.readUInt32BE(0)
			/* Если текущий буфер меньше чем мета (4 байта) + длина тела, запрос не полный - выходим */
			if (this.buffer.length < 4 + len) break

			/* Сверяем версию протокола */
			const version = this.buffer.readUInt8(4)
			/* Проверяем версию протокола. todo: добавить поддержку старых версий */
			if (version !== protocolVersion) {
				throw new Error('Bad protocol version')
			}

			/* Извлекаем payload (без первых 5 служебных байт) */
			const payload = this.buffer.subarray(5, 4 + len)
			/* Декодируем MessagePack и сохраняем */
			messages.push(decode(payload))

			/** subarray не копирует данные, он создает новое представление поверх одного и того же большого блока памяти */
			/* Отбрасываем из буфера уже прочитанные байты */
			this.buffer = this.buffer.subarray(4 + len)
		}

		/*
		 * Если после subarray остался хвост < 4 КБ,
		 * пересоздаём буфер через Buffer.from, чтобы освободить
		 * память старого большого ArrayBuffer
		 */
		if (this.buffer.length && this.buffer.length < 4096)
			this.buffer = Buffer.from(this.buffer)

		return messages
	}
}
