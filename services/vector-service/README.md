# MyAgent Vector Service

Local retrieval service สำหรับค้นข้อความทั่วไป ข้อมูลเอกสาร หรือเอกสารความรู้
ใช้ FastAPI, Qdrant และ multilingual-e5-small
รันด้วย Docker Compose

## ความสามารถ

- ค้นข้อมูลเอกสารจากความหมายของคำถาม
- รับคำถามภาษาไทย
- กำหนดจำนวนผลลัพธ์และคะแนนขั้นต่ำได้
- นำเข้าข้อมูลเอกสารจากไฟล์ JSON
- เก็บข้อมูลฐานข้อมูลและไฟล์โมเดลใน Docker volumes

Service นี้ส่งข้อมูลที่ค้นพบกลับให้ผู้เรียก
ส่วนการสร้างคำตอบด้วย LLM อยู่ในระบบบอท

## สิ่งที่ต้องมี

- Docker Desktop ที่เปิด Engine อยู่
- Docker Compose
- อินเทอร์เน็ตสำหรับดาวน์โหลด images, libraries และโมเดลครั้งแรก

## เริ่มใช้งาน

Clone branch นี้แล้วเข้าโฟลเดอร์ service:

```powershell
git clone --branch feature/vector-service https://github.com/codeboyz12/myagent.git
cd myagent/services/vector-service
```

จากนั้นรัน:

```powershell
docker compose up -d --build
```

นำเข้าเอกสารตัวอย่าง:

```powershell
docker compose exec api python -m app.seed
```

ครั้งแรกจะดาวน์โหลดโมเดล embedding จึงอาจใช้เวลาหลายนาที

ตรวจการเชื่อมต่อฐานข้อมูล:

```powershell
Invoke-RestMethod -Uri "http://localhost:8000/health"
```

ผลที่คาดหวัง:

```json
{
  "status": "ok",
  "qdrant": "connected"
}
```

`/health` ตรวจการเชื่อมต่อ Qdrant
ไม่ได้ตรวจว่าโมเดลพร้อมใช้งานหรือมีข้อมูลเอกสารแล้ว

## API

- Swagger UI: http://localhost:8000/docs
- Qdrant Dashboard: http://localhost:6333/dashboard

### POST /retrieve

ตัวอย่าง request:

```json
{
  "query": "อยากได้รองเท้าเบา ๆ สำหรับวิ่ง",
  "top_k": 3,
  "score_threshold": 0.85
}
```

| Field | รายละเอียด |
|---|---|
| query | คำถาม ความยาว 1–1000 ตัวอักษร ห้ามเป็นช่องว่างล้วน |
| top_k | จำนวนผลลัพธ์สูงสุด 1–20 ค่าเริ่มต้น 3 |
| score_threshold | คะแนนขั้นต่ำ -1 ถึง 1 ไม่บังคับระบุ ค่าเริ่มต้นไม่กรองคะแนน |

ตัวอย่างเรียกจาก PowerShell:

```powershell
$body = @{
    query = "อยากได้รองเท้าเบา ๆ สำหรับวิ่ง"
    top_k = 3
    score_threshold = 0.85
} | ConvertTo-Json

$response = Invoke-RestMethod `
    -Uri "http://localhost:8000/retrieve" `
    -Method Post `
    -ContentType "application/json; charset=utf-8" `
    -Body ([System.Text.Encoding]::UTF8.GetBytes($body))

$response | ConvertTo-Json -Depth 10
```

Response ประกอบด้วย query และ results
แต่ละผลลัพธ์มี id, text, score และ metadata
เรียงจากคะแนนสูงไปต่ำ

ถ้าไม่มีรายการผ่านคะแนนขั้นต่ำ:

```json
{
  "query": "มีโทรศัพท์มือถือขายไหม",
  "results": []
}
```

### ข้อผิดพลาด

- 422: request ไม่ผ่านการตรวจสอบ
- 503: ติดต่อ Qdrant ไม่ได้ หรือยังไม่มี collection เอกสาร
- 502: Qdrant ปฏิเสธคำขอค้นหา

## การเชื่อมต่อจากบอท

ถ้าบอทรันบนเครื่องเดียวกันนอก Docker ให้เรียก:

http://localhost:8000/retrieve

ถ้าบอทรันในอีก container บน Docker Desktop
ให้เรียกผ่าน:

http://host.docker.internal:8000/retrieve

ต้องทดสอบการเชื่อมต่อจาก container ของบอทจริงด้วย
หากใช้ Docker network ร่วมกัน สามารถเรียกผ่านชื่อ service
`http://api:8000/retrieve` ได้ โดยต้องตั้งค่า network ให้เชื่อมถึงกันก่อน

พอร์ตใน compose ผูกกับ 127.0.0.1 เพื่อใช้งานในเครื่อง
ยังไม่ได้ตั้งค่าสำหรับเปิดเป็น public service

## เพิ่มหรือแก้ข้อมูลเอกสาร

แก้ไฟล์ `app/documents.json`:

- ใช้ id เป็นจำนวนเต็มบวกและไม่ซ้ำกัน
- text คือข้อความที่จะนำไปสร้าง embedding
- metadata คือรายละเอียดที่จะส่งกลับให้บอท
- ใส่ข้อมูลสำคัญที่ต้องการค้นไว้ใน text ด้วย
- บันทึกไฟล์เป็น UTF-8

จากนั้นรัน:

```powershell
docker compose up -d --build
docker compose exec api python -m app.seed
```

การใช้ id เดิมจะอัปเดตข้อมูลเดิม
การใช้ id ใหม่จะเพิ่มข้อมูลใหม่

การลบรายการออกจาก JSON ไม่ได้ลบรายการเดิมออกจาก DB
สคริปต์นี้ทำ upsert ไม่ได้ซิงก์การลบ

## โมเดลและฐานข้อมูล

- Embedding model: intfloat/multilingual-e5-small
- Vector dimensions: 384
- Distance: Cosine
- Collection: documents
- คำถามเติม prefix `query: `
- ข้อมูลเอกสารเติม prefix `passage: `

ต้องใช้โมเดลและวิธีเตรียมข้อความที่สอดคล้องกัน
ทั้งตอนนำเข้าและค้นข้อมูล
หากเปลี่ยนโมเดล ต้องสร้าง embedding ของข้อมูลใหม่
แม้โมเดลใหม่จะมีจำนวนมิติเท่าเดิมก็ตาม

## ข้อจำกัด

- คะแนนเป็นความใกล้เคียง ไม่ใช่ความน่าจะเป็นหรือเปอร์เซ็นต์ความถูกต้อง
- ค่า 0.85 เป็นค่าทดลองกับเอกสารตัวอย่าง 3 รายการ
  ต้องประเมินใหม่กับข้อมูลและคำถามจริง
- ตัวกรองคะแนนไม่รับประกันว่าจะปฏิเสธคำถามนอกเรื่องได้ทั้งหมด
- การค้นด้วยความหมายไม่ได้รับประกันเงื่อนไขราคาและสต็อก
  เงื่อนไขเหล่านี้ควรตรวจจากข้อมูลเอกสารโดยตรง
- ข้อความยาวเกินขีดจำกัดของโมเดลอาจถูกตัด
  ยังไม่มีระบบแบ่งเอกสารยาวเป็น chunks
- ข้อมูลเอกสารใน repository เป็นข้อมูลสมมติสำหรับทดสอบ

## หยุดและตรวจสอบระบบ

หยุด containers โดยเก็บข้อมูลไว้:

```powershell
docker compose down
```

เปิดใหม่:

```powershell
docker compose up -d
```

ดู logs:

```powershell
docker compose logs --tail 50 api
docker compose logs --tail 50 qdrant
```

ข้อมูล DB อยู่ใน volume `qdrant_storage`
ไฟล์โมเดลอยู่ใน volume `model_cache`

คำสั่ง `docker compose down -v` จะลบ volumes ของโปรเจกต์
รวมถึงข้อมูล DB และโมเดลที่ดาวน์โหลดไว้

## ผลทดสอบเบื้องต้น

ทดสอบด้วยสินค้าสมมติ 3 รายการ:

| คำถาม | อันดับแรก |
|---|---|
| ต้องการรองเท้าหนังสีดำใส่ประชุม | Office B |
| จะไปเดินป่า อยากได้รองเท้าเกาะพื้นดี | Trail C |
| อยากได้รองเท้าสำหรับวิ่งออกกำลังกาย | Runner A |

เมื่อใช้ score_threshold = 0.85
คำถาม “มีโทรศัพท์มือถือขายไหม” ได้ results ว่าง

ผลนี้เป็นการทดสอบเบื้องต้น ยังไม่ใช่การประเมินกับชุดข้อมูลขนาดใหญ่

## รูปแบบข้อมูลทั่วไป

`app/documents.json` เป็นรายการ object ที่มี `id`, `text`, `metadata`:

```json
[
  {
    "id": 100,
    "text": "ร้านเปิดวันจันทร์ถึงศุกร์ เวลา 09:00–18:00 น.",
    "metadata": {"source": "store-policy", "category": "opening-hours"}
  }
]
```

`id` เป็นจำนวนเต็มตั้งแต่ 1 ถึง 18446744073709551615 และต้องไม่ซ้ำในไฟล์
`metadata` เป็น object ที่กำหนด key ได้เอง ส่วนที่สร้าง embedding คือ `text` เท่านั้น
ข้อมูลรองเท้าที่แนบมาเป็นเพียงตัวอย่าง ไม่ใช่ข้อกำหนดของ service
การ seed ใช้ ID ร่วมกันทั้ง collection จึงควรตกลง ID ระหว่างผู้จัดเตรียมข้อมูล

## DELETE /documents/{document_id}

ลบข้อมูลตาม ID และรอให้ DB ดำเนินการเสร็จ:

```powershell
Invoke-RestMethod -Uri "http://localhost:8000/documents/100" -Method Delete
```

คืน `{"status":"ok","id":100}` หาก DB รับคำสั่งสำเร็จ
การลบ ID ที่ไม่มีอยู่ถือว่าสำเร็จเช่นกัน ไม่ใช่การยืนยันว่าเคยมีรายการนั้น
ถ้ารายการยังอยู่ใน JSON การรัน seed ครั้งถัดไปจะเพิ่มกลับมา
ต้องนำรายการออกจาก JSON ด้วยหากไม่ต้องการนำเข้าซ้ำ
API นี้ไม่มี authentication และตั้งใจใช้ในเครื่องเท่านั้น

## เปลี่ยนจาก collection เดิม

เวอร์ชันนี้ใช้ collection `documents` แทน `products`
ให้รัน seed เพื่อใส่ข้อมูลจาก JSON ลง collection ใหม่
collection `products` เดิมไม่ถูกแก้ไขหรือลบอัตโนมัติ
ข้อมูลที่เคยเพิ่มตรงเข้า collection เดิมต้องย้ายเอง
