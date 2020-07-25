/* Copyright 2020 Ethan Halsall

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>
*/

const fetch = require("node-fetch");
const AbortController = require("abort-controller");
const fs = require("fs");

const IcecastMetadataTransformStream = require("./IcecastMetadataTransformStream");
const CueBuilder = require("./CueBuilder");

/**
 * @description Records an Icecast Stream with Metadata into an audio file and a cue file
 * @description Icecast server must return a constant bitrate in the icyBr header
 * @param {Object} IcecastMetadataRecorder constructor parameter
 * @param {string} IcecastMetadataRecorder.fileName Filename to store audio and cue files
 * @param {string} [IcecastMetadataRecorder.fileFormat=mp3] File extension for audio file
 * @param {string} IcecastMetadataRecorder.streamTitle Title of cue file
 * @param {string} IcecastMetadataRecorder.streamEndpoint Web address for Icecast stream
 * @param {number} [IcecastMetadataRecorder.cueRolloverInterval=undefined] Number of metadata updates before creating a new cue file. Use for compatibility with applications such as foobar2000.
 */
class IcecastMetadataRecorder {
  constructor({
    fileName,
    fileFormat = "mp3",
    streamTitle,
    streamEndpoint,
    cueRolloverInterval,
  }) {
    this._fileName = fileName;
    this._fileFormat = fileFormat;
    this._streamTitle = streamTitle;
    this._streamEndpoint = streamEndpoint;
    this._cueRolloverInterval = cueRolloverInterval;

    this._cueRollovers = 0;
    this._startDate = new Date(Date.now());
  }

  /**
   * @description Fetches and starts recording the icecast stream
   */
  record() {
    this._controller = new AbortController();
    this._audioFileName = `${this._fileName}.${this._fileFormat}`;
    this._audioFileWritable = fs.createWriteStream(this._audioFileName);

    fetch(this._streamEndpoint, {
      method: "GET",
      headers: { "Icy-MetaData": "1" },
      signal: this._controller.signal,
    })
      .then((res) => {
        this._getIcecast(res.headers);
        this._getCueBuilder();

        res.body.pipe(this._icecast).pipe(this._audioFileWritable);
      })
      .catch((e) => {
        this._stop();
        if (e.name !== "AbortError") {
          throw e;
        }
      });
  }

  /**
   * @description Stops recording the Icecast stream
   */
  stop() {
    this._controller.abort();
  }

  _stop() {
    this._audioFileWritable.close();
    this._cueFileWritable.close();
  }

  _getIcecast(headers) {
    this._icecast = new IcecastMetadataTransformStream({
      icyMetaInt: parseInt(headers.get("Icy-MetaInt")),
      icyBr: parseInt(headers.get("Icy-Br")),
      onMetadataQueue: this._recordMetadata.bind(this),
    });
  }

  _getCueBuilder() {
    this._cueBuilder = new CueBuilder({
      title: this._streamTitle,
      fileName: this._audioFileName,
      comments: [
        "Generated by IcecastMetadataRecorder",
        this._startDate.toISOString(),
      ],
    });

    // add a rollover number to the file name
    const cueFileName = this._cueRollovers
      ? `${this._fileName}.${this._cueRollovers}.cue`
      : `${this._fileName}.cue`;

    this._cueFileWritable = fs.createWriteStream(cueFileName);
    this._cueBuilder.pipe(this._cueFileWritable);
  }

  _recordMetadata(meta) {
    const trackCount = this._cueBuilder.getTrackCount();

    /**
     * When there is only one more cue entry remaining
     * until the next rollover, insert an END track.
     * There is no way to indicate the end of a cue file
     * so this will have to do.
     *
     * Reasonable rollover thresholds should be based on your player's limitations.
     * (i.e. Foobar2000 accepts up to 999 tracks in the cue file)
     */
    if (trackCount + 1 == this._cueRolloverInterval) {
      this._cueBuilder.addTrack(meta.time, "END");
      this._cueRollovers++;
      this._cueFileWritable.close();
      this._getCueBuilder();
    }

    const timeStamp = new Date(
      this._startDate.getTime() + meta.time * 1000
    ).toISOString();

    this._cueBuilder.addTrack(
      trackCount && meta.time, // force metadata for first track to show immediately
      `${timeStamp} ${meta.metadata}`
    );
  }
}

module.exports = IcecastMetadataRecorder;