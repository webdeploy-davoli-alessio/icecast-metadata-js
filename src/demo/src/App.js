import React, { useState, useCallback } from "react";
import Player from "./Player/Player";
import StationSelector from "./StationSelector/StationSelector";
import stations from "./stations.json";
import styles from "./App.module.css";
import About from "./About/About";

import IcecastMetadataPlayer from "icecast-metadata-player";

const SELECT_STATION = "Select a station";
const SELECT_OR_PLAY = "Select a station or press play";
const LOADING = "Loading...";

const App = () => {
  const [station, setStation] = useState();
  const [playing, setPlaying] = useState(false);
  const [audioElement] = useState(new Audio());

  const [metadata, setMetadata] = useState(SELECT_STATION);
  const [icecast, setIcecast] = useState();

  const changeStation = useCallback(
    async (station) => {
      if (icecast) {
        await icecast.stop();
        icecast.detachAudioElement();
      }

      const player = new IcecastMetadataPlayer(station.endpoint, {
        onMetadata: (meta) => {
          console.log(meta);
          setMetadata(meta);
        },
        onPlay: () => {
          setPlaying(true);
        },
        onStop: () => {
          setPlaying(false);
          setMetadata(SELECT_OR_PLAY);
        },
        onLoad: () => {
          setPlaying(true);
          setMetadata(LOADING);
        },
        icyDetectionTimeout: 5000,
        enableLogging: true,
        metadataTypes: station.metadataTypes,
        audioElement,
      });

      player.play();

      setIcecast(player);
      setStation(station);
    },
    [icecast, audioElement]
  );

  const toggle = useCallback(() => {
    playing ? icecast.stop() : icecast.play();
  }, [icecast, playing]);

  return (
    <>
      <header className={styles.header}>
        <About />
      </header>
      <StationSelector stations={stations} changeStation={changeStation} />
      <footer className={styles.footer}>
        <Player
          station={station}
          toggle={toggle}
          playing={playing}
          metadata={metadata}
          audioElement={audioElement}
        ></Player>
      </footer>
    </>
  );
};

export default App;
