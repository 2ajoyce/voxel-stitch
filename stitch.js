'use strict';

var createArtpacks = require('artpacks');
var ndarray = require('ndarray');
var inherits = require('inherits');
var EventEmitter = require('events').EventEmitter;
var fill = require('ndarray-fill');
var toarray = require('toarray');

module.exports = function(game, opts) {
  return new StitchPlugin(game, opts);
};
module.exports.pluginInfo = {
  loadAfter: ['voxel-registry']
};

function StitchPlugin(game, opts) {
  this.registry = opts.registry || game.plugins.get('voxel-registry');
  if (!this.registry) throw new Error('voxel-stitcher requires voxel-registry plugin');

  opts = opts || {};
  opts.artpacks = opts.artpacks || ['https://dl.dropboxusercontent.com/u/258156216/artpacks/ProgrammerArt-2.2-dev-ResourcePack-20140308.zip'];
  this.artpacks = createArtpacks(opts.artpacks);

  // texture atlas width and height
  // MAX_TEXTURE_SIZE at http://webglstats.com/, 100% of WebGL users support 2048x2048
  this.atlasSize = opts.atlasSize !== undefined ? opts.atlasSize : 256;//2048; // requires downsampling each tile even if empty :( so make it smaller
  this.tileSize = opts.tileSize !== undefined ? opts.tileSize : 16;
  this.tileCount = this.atlasSize / this.tileSize; // each dimension

  // 5-dimensional array of tiles compatible with:
  //  https://github.com/mikolalysenko/tile-mip-map
  //  https://github.com/mikolalysenko/gl-tile-map
  // [rows, columns, tile height, tile width, channels]
  this.atlas = ndarray(new Uint8Array(this.atlasSize * this.atlasSize * 4),
      [this.tileCount, this.tileCount, this.tileSize, this.tileSize, 4]
      // TODO: strides?
      );
  fill(this.atlas, function(row,col,y,x,c) { return 80; }); // fill background for easier debugging TODO

  this.nextX = this.nextY = 0;
  this.countLoading = 0;
  this.countLoaded = 0;

  this.enable();
}

inherits(StitchPlugin, EventEmitter);

StitchPlugin.prototype.stitch = function() {
  var textures = this.registry.getBlockPropsAll('texture');

  var textureNames = [];

  for (var i = 0; i < textures.length; i += 1) {
    textureNames = textureNames.concat(toarray(textures[i]));
  }

  this.countLoading = textureNames.length;

  for (var j = 0; j < textureNames.length; j += 1) {
    var textureName = textureNames[j];

    this.addTextureName(textureName, this.nextX, this.nextY);
    this.incrementSlot();
  }
}

StitchPlugin.prototype.incrementSlot = function() {
  // point to next slot
  this.nextX += 1;
  if (this.nextX >= this.tileCount) {
    this.nextX = 0;
    this.nextY += 1; // TODO: instead, add to 4-dimensional strip then recast as 5-d?
    if (this.nextY >= this.tileCount) {
      throw new Error('texture sheet full! '+this.tileCount+'x'+this.tileCount+' exceeded');
      // TODO: 'flip' the texture sheet, see https://github.com/deathcap/voxel-texture-shader/issues/2
    }
  }
};


StitchPlugin.prototype.addTextureName = function(textureName, tileX, tileY) {
  var self = this;

  this.artpacks.getTextureNdarray(textureName, function(pixels) {
    self.addTexturePixels(pixels, tileX, tileY);
  }, function(err) {
    console.log(err);
  });
};

StitchPlugin.prototype.addTexturePixels = function(pixels, tileX, tileY) {
  /* debug
  var src = require('save-pixels')(pixels, 'canvas').toDataURL();
  var img = new Image();
  img.src = src;
  document.body.appendChild(img);
  */
  console.log(pixels);

  // copy to atlas
  // TODO: bitblt? ndarray-group?
  for (var i = 0; i < pixels.shape[0]; i += 1) {
    for (var j = 0; j < pixels.shape[1]; j += 1) {
      for (var k = 0; k < pixels.shape[2]; k += 1) {
        this.atlas.set(tileX, tileY, i, j, k, pixels.get(i, j, k));
      }
    }
  }

  this.emit('added');
  this.countLoaded += 1;
  if (this.countLoaded >= this.countLoading) {
    this.emit('addedAll');
  }
};

StitchPlugin.prototype.enable = function() {
};

StitchPlugin.prototype.disable = function() {
};


