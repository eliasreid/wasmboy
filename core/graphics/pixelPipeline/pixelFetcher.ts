// Fetcher for the pixel pipeline
// https://youtu.be/HyzD8pNlpwI?t=2957
import { PIXEL_PIPELINE_ENTIRE_SCANLINE_FIFO_LOCATION } from '../../constants';
import { checkBitOnByte, setBitOnByte, resetBitOnByte } from '../../helpers/index';
import { Lcd } from '../lcd';
import { getTileDataAddress } from '../tiles';
import { LoadFromVramBank } from '../util';
import { PixelPipeline } from './pixelPipeline';

export class PixelFetcher {
  // Number of CPU cycles for the current step of the fetch
  static cycles: i32 = 0;

  // Status of the Fetcher
  // 0: Idling
  // 1: Reading Tile Number
  // 2: Reading first byte of Tile Data
  // 3: Reading second byte of Tile Data
  static currentStatus: i32 = 0;

  // Sprite Info
  static isSprite: boolean = false;
  static spriteAttributeIndex: i32 = 0;

  // The current tile we are be fetching from the tileMap
  static tileMapLocation: i32 = 0;

  // The line (y value) of the tile we are fetching (0 -> 7)
  // But we start counting at 1: 1 2 3 4 5 6 7 0
  // NOTE: We wil handle the x/y flipping in the fetcher
  static tileLine: i32 = 0;

  // Our response bytes in the fetcher
  static tileIdFromTileMap: i32 = 0;
  static tileDataByteZero: i32 = 0;
  static tileDataByteOne: i32 = 0;
  static tileAttributes: i32 = 0;

  static startFetch(tileMapLocation: i32, tileLine: i32, isSprite: boolean, spriteArrtributeIndex: i32): void {
    // Reset the fetcher
    PixelFetcher.currentStatus = 0;
    PixelFetcher.cycles = 0;

    PixelFetcher.tileMapLocation = tileMapLocation;
    PixelFetcher.tileLine = tileLine;
    PixelFetcher.isSprite = isSprite;
    PixelFetcher.spriteAttributeIndex = spriteAttributeIndex;
  }

  static update(numberOfCycles: i32) {
    // Check if we can continue idling
    // Pixel Fetcher won't add more pixels unless there are only 8 pixels left
    let pixelsRemainingInFifo = PixelPipeline.numberOfPixelsInFifo - pixelFifoIndex;
    if (PixelFetcher.currentStatus === 0 && pixelsRemainingInFifo > 8) {
      return;
    }

    // Update our cycles
    PixelFetcher.cycles += numberOfCycles;

    // Update our current status / Execute the step
    let cyclesPerStep = 8 << (<i32>Cpu.GBCDoubleSpeed);
    if (PixelFetcher.currentStatus === 0) {
      PixelFetcher.currentStatus = 1;
    } else if (PixelFetcher.currentStatus === 1 && PixelFetcher.cycles >= cyclesPerStep) {
      // Read the tile number
      _readTileIdFromTileMap();

      PixelFetcher.currentStatus = 2;

      PixelFetcher.cycles -= cyclesPerStep;
    } else if (PixelFetcher.currentStatus === 2 && PixelFetcher.cycles >= cyclesPerStep) {
      // Read the tile data
      _readTileData(0);

      PixelFetcher.currentStatus = 3;

      PixelFetcher.cycles -= cyclesPerStep;
    } else if (PixelFetcher.currentStatus === 3 && PixelFetcher.cycles >= cyclesPerStep) {
      // Read the tile data
      _readTileData(1);

      // Place into the fifo
      _storeFetchIntoFifo();

      // Set to Idle
      PixelFetcher.currentStatus = 0;

      PixelFetcher.cycles -= cyclesPerStep;
    }
  }
}

function _readTileIdFromTileMap(): i32 {
  // Get the tile Id on the Tile Map
  PixelFetcher.tileIdFromTileMap = loadFromVramBank(PixelFetcher.tileMapLocation, 0);
}

function _readTileData(byteNumber: i32): i32 {
  // Get our seleted tile data memory location
  // This is always one for sprites, or can be set on LCDC for BG and Window
  let tileDataMemoryLocation = Graphics.memoryLocationTileDataSelectZeroStart;
  if (PixelFetcher.isSprite || Lcd.bgWindowTileDataSelect) {
    tileDataMemoryLocation = Graphics.memoryLocationTileDataSelectOneStart;
  }

  let tileDataAddress = getTileDataAddress(tileDataMemoryLocation, PixelFetcher.tileIdFromTileMap);

  // Finally find which VRAM Bank to read from
  // Sprites and BG tiles use different attributes
  let vramBankId: i32 = 0;
  let tileAttributes: i32 = 0;
  if (PixelFetcher.isSprite) {
    // Get our sprite attributes
    let spriteTableIndex = i * 4;
    let spriteMemoryLocation = Graphics.memoryLocationSpriteAttributesTable + spriteTableIndex;

    // Pan docs of sprite attribute table (Byte 3 of Sprite Table Entry)
    // Bit2-0 Palette number  **CGB Mode Only**     (OBP0-7)
    // Bit3   Tile VRAM-Bank  **CGB Mode Only**     (0=Bank 0, 1=Bank 1)
    // Bit4   Palette number  **Non CGB Mode Only** (0=OBP0, 1=OBP1)
    // Bit5   X flip          (0=Normal, 1=Horizontally mirrored)
    // Bit6   Y flip          (0=Normal, 1=Vertically mirrored)
    // Bit7   OBJ-to-BG Priority (0=OBJ Above BG, 1=OBJ Behind BG color 1-3)
    //      (Used for both BG and Window. BG color 0 is always behind OBJ)
    tileAttributes = eightBitLoadFromGBMemory(spriteMemoryLocation + 3);
  } else if (Cpu.GBCEnabled) {
    // Get the GB BG Map Attributes (Tile Map Location, VRAM Bank 1)
    // Bit 0-2  Background Palette number  (BGP0-7)
    // Bit 3    Tile VRAM Bank number      (0=Bank 0, 1=Bank 1)
    // Bit 4    Not used
    // Bit 5    Horizontal Flip            (0=Normal, 1=Mirror horizontally)
    // Bit 6    Vertical Flip              (0=Normal, 1=Mirror vertically)
    // Bit 7    BG-to-OAM Priority         (0=Use OAM priority bit, 1=BG Priority)
    tileAttributes = loadFromVramBank(PixelFetcher.tileMapLocation, 1);
  }

  // Check for our Vram Bank
  if (checkBitOnByte(3, tileAttributes)) {
    vramBankId = 1;
  }

  // Set out tile Line
  let tileLine = PixelFetcher.tileLine;

  // Check for a Y Flip
  if (checkBitOnByte(6, tileAttributes)) {
    // Get the height of the tile
    let tileHeight = 8;
    if (PixelFetcher.isSprite && Lcd.tallSpriteSize) {
      tileHeight = 16;
    }

    // Since we start counting tile lines at 0. Subtract 1
    tileHeight -= 1;

    // To read backwards, assume we start at 7, and subtract what we wanted.
    // E.g 7 - 0 = 7 (The First line, becomes the last)
    // E.g 7 - 1 = 6 (The second line, becomes the second to last)
    tileLine = tileHeight - tileLine;
  }

  // Finally save the byte to our fetcher memoery
  // Remember to represent a single line of 8 pixels on a tile, we need two bytes.
  // And each line is placed one after the other in a 2d -> 1d array.
  // E.g [line 0 byte 0 | line 0 byte 1 | line 1 byte 0 | etc... ]
  // Therefore, we need to times our modulo by 2, to get the correct line of pixels on the tile.
  let tileByteAddress = tileDataAddress + tileLine * 2 + byteNumber;
  let tileData = loadFromVramBank(tileByteAddress, vramBankId);

  // Handle the X Flip
  // Simply reverse the byte
  if (checkBitOnByte(5, tileAttributes)) {
    let newTileData = 0;
    for (let i = 0; i < 8; i++) {
      if (checkBitOnByte(i, tileData)) {
        setBitOnByte(7 - i, newTileData);
      }
    }
    tileData = newTileData;
  }

  if (byteNumber === 0) {
    PixelFetcher.tileDataByteZero = tileData;
  } else {
    PixelFetcher.tileDataByteOne = tileData;
  }
}

function _storeFetchIntoFifo(): void {
  if (PixelFetcher.isSprite) {
    // Need to mix the pixel on top of the old data

    // Get the location of where we will be mixing
    // Which is the first 8 pixels in the fifo
    let pixelFifoIndex = PixelPipeline.pixelFifoIndex * 11;

    // Get our type per pixel
    let typePerPixel = eightBitLoadFromGBMemory(PIXEL_PIPELINE_ENTIRE_SCANLINE_FIFO_LOCATION + pixelFifoIndex + 2);

    // Go one by one for the 8 pixels in the current fifo
    for (let i = 0; i < 8; i++) {
      // Don't draw a sprite, over a sprite
      if (checkBitOnByte(i, typePerPixel)) {
        continue;
      }

      // Get the Palette Color Ids of the pixel in our current sprite
      // Colors are represented by getting X position of ByteTwo, and X positon of Byte One
      // To Get the color Id.
      // For example, the result of the color id is 0000 00[xPixelByteTwo][xPixelByteOne]
      // See: How to draw a tile/sprite from memory: http://www.codeslinger.co.uk/pages/projects/gameboy/graphics.html
      let spritePaletteColorId = 0;
      if (checkBitOnByte(i, PixelFetcher.tileDataByteOne)) {
        // Byte one represents the second bit in our color id, so bit shift
        spritePaletteColorId += 1;
        spritePaletteColorId = spritePaletteColorId << 1;
      }
      if (checkBitOnByte(i, PixelFetcher.tileDataByteZero)) {
        spritePaletteColorId += 1;
      }

      // Palette ColorId zero (last two bits of pallette) of a sprite are always transparent
      // http://gbdev.gg8.se/wiki/articles/Video_Display
      if (spriteColorId !== 0) {
        continue;
      }

      // Load the data & attributes for the pixel
      let fifoTileDataByteZero = eightBitLoadFromGBMemory(PIXEL_PIPELINE_ENTIRE_SCANLINE_FIFO_LOCATION + pixelFifoIndex + 0);
      let fifoTileDataByteOne = eightBitLoadFromGBMemory(PIXEL_PIPELINE_ENTIRE_SCANLINE_FIFO_LOCATION + pixelFifoIndex + 1);
      let fifoTileAttributes = eightBitLoadFromGBMemory(PIXEL_PIPELINE_ENTIRE_SCANLINE_FIFO_LOCATION + pixelFifoIndex + 3 + i);

      // Get the Palette Color Ids of the pixel in the Fifo
      let fifoPaletteColorId = 0;
      if (checkBitOnByte(i, fifoTileDataByteOne)) {
        // Byte one represents the second bit in our color id, so bit shift
        fifoPaletteColorId += 1;
        fifoPaletteColorId = fifoPaletteColorId << 1;
      }
      if (checkBitOnByte(i, fifoTileDataByteZero)) {
        fifoPaletteColorId += 1;
      }

      // NOTE:
      // We are trying to draw a sprite pixel over a BG/Window pixel.
      // There are multiple cases where we NEED to draw a sprite pixel over a Background
      // 1. The LCDC Bit 0 - BG/Window Display/Priority is cleared, thus BG priority is ignored
      // 2. The Sprite Priority bit is NOT set. If it is, we can only draw over BG color id 0.
      // 3. (CGB Only) The BG Priority bit is NOT set. If it is, If it is, we can only draw over BG color id 0.
      let shouldShowRelativeToLcdcPriority = Cpu.GBCEnabled && !Lcd.bgDisplayEnabled;
      let shouldShowRelativeToOamPriority = !checkBitOnByte(7, PixelFetcher.tileAttributes) || fifoPaletteColorId === 0;
      let shouldShowRelativeToBgPriority = !checkBitOnByte(7, fifoTileAttributes) || fifoPaletteColorId === 0;

      if (shouldShowRelativeToLcdcPriority || (shouldShowRelativeToOamPriority && shouldShowRelativeToBgPriority)) {
        // Mix the pixel!

        // Replace the pixel data in the fifo with out sprite
        if (checkBitOnByte(1, spritePaletteColorId)) {
          setBitOnByte(i, fifoTileDataByteOne);
        } else {
          resetBitOnByte(i, fifoTileDataByteOne);
        }
        if (checkBitOnByte(0, spritePaletteColorId)) {
          setBitOnByte(i, fifoTileDataByteZero);
        } else {
          resetBitOnByte(i, fifoTileDataByteZero);
        }

        // Set that we are a sprite
        setBitOnByte(i, typePerPixel);

        // Write back to the fifo
        eightBitStoreIntoGBMemory(PIXEL_PIPELINE_ENTIRE_SCANLINE_FIFO_LOCATION + pixelFifoIndex, fifoTileDataByteZero);
        eightBitStoreIntoGBMemory(PIXEL_PIPELINE_ENTIRE_SCANLINE_FIFO_LOCATION + pixelFifoIndex + 1, fifoTileDataByteOne);
        eightBitStoreIntoGBMemory(PIXEL_PIPELINE_ENTIRE_SCANLINE_FIFO_LOCATION + pixelFifoIndex + 2, typePerPixel);
        eightBitStoreIntoGBMemory(PIXEL_PIPELINE_ENTIRE_SCANLINE_FIFO_LOCATION + pixelFifoIndex + 3 + i, PixelFetcher.tileAttributes);
      }
    }
  } else {
    // Simply add the pixels to the end of the fifo
    // * 11, because Fifo has the 2 data tile bytes, and for WasmBoy Specifically,
    // A 3rd byte representing the type of pixel (0 = BG/Window, 1 = Sprite)
    // Bytes 4-11 represent the attributes for that tile's pixel
    let pixelFifoIndex = PixelPipeline.numberOfPixelsInFifo * 11;
    eightBitStoreIntoGBMemory(PIXEL_PIPELINE_ENTIRE_SCANLINE_FIFO_LOCATION + pixelFifoIndex, PixelFetcher.tileDataByteZero);
    eightBitStoreIntoGBMemory(PIXEL_PIPELINE_ENTIRE_SCANLINE_FIFO_LOCATION + pixelFifoIndex + 1, PixelFetcher.tileDataByteOne);
    eightBitStoreIntoGBMemory(PIXEL_PIPELINE_ENTIRE_SCANLINE_FIFO_LOCATION + pixelFifoIndex + 2, 0);
    for (let i = 0; i < 8; i++) {
      eightBitStoreIntoGBMemory(PIXEL_PIPELINE_ENTIRE_SCANLINE_FIFO_LOCATION + pixelFifoIndex + 3 + i, PixelFetcher.tileAttributes);
    }
    PixelPipeline.numberOfPixelsInFifo += 8;
  }
}
