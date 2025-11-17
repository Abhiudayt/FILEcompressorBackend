import express from "express";
import multer from "multer";
import sharp from "sharp";
import JSZip from "jszip";
import { v4 as uuidv4 } from "uuid";
import cors from "cors";
import fs from "fs";
import path from "path";

const app = express();
app.use(cors());
app.use(express.json());

const UPLOAD_DIR = "./uploads";
const OUTPUT_DIR = "./outputs";

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

// Multer storage
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

// Serve static download URLs
app.use("/files", express.static(path.join(process.cwd(), OUTPUT_DIR)));

// Detect if single/bulk in same route
app.post("/compress", upload.array("files"), async (req, res) => {
  try {
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    // If single file
    if (files.length === 1) {
      const file = files[0];

      const newName = uuidv4() + ".webp";
      const outputPath = `${OUTPUT_DIR}/${newName}`;

      await sharp(file.path)
        .resize({ width: 1600 })
        .webp({ quality: 75 })
        .toFile(outputPath);

      // Cleanup original upload
      fs.unlinkSync(file.path);

      return res.json({
        type: "single",
        url: `${req.protocol}://${req.get("host")}/files/${newName}`,
      });
    }

    // If bulk → create ZIP
    const zip = new JSZip();

    for (const file of files) {
      try {
        const buffer = await sharp(file.path)
          .resize({ width: 1600 })
          .webp({ quality: 75 })
          .toBuffer();

        zip.file(file.originalname.replace(/\.\w+$/, ".webp"), buffer);

        fs.unlinkSync(file.path); // Cleanup
      } catch (err) {
        console.log("Error compressing:", file.originalname, err);
      }
    }

    const zipData = await zip.generateAsync({ type: "nodebuffer" });

    const zipName = uuidv4() + ".zip";
    const zipPath = `${OUTPUT_DIR}/${zipName}`;

    fs.writeFileSync(zipPath, zipData);

    return res.json({
      type: "bulk",
      url: `${req.protocol}://${req.get("host")}/files/${zipName}`,
    });
  } catch (err) {
    console.error("Compression error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.listen(3000, () => {
  console.log("🚀 Compressor server running on http://localhost:3000");
});
