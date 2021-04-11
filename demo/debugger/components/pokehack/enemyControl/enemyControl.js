// Compoonent that contains the canvas and the actual output
// of WasmBoy

import { h, Component } from 'preact';
s;
import { Pubx } from 'pubx';
import { PUBX_KEYS } from '../../../pubx.config';

import { WasmBoy } from '../../../wasmboy';

import './enemyControl.css';

let unsubLoading = false;

export default class EnemyControl extends Component {
  constructor() {
    super();

    // Exerytime WasmBoy gets updated, simply re-render

    // TODO: don't need now, but should eventually try greying out moves that aren't available
    // Only un-grey when they ARE available

    // Pubx.subscribe(PUBX_KEYS.WASMBOY, newState => this.setState(newState));
  }

  componentDidMount() {
    Pubx.get(PUBX_KEYS.WASMBOY).update();

    unsubLoading = Pubx.subscribe(PUBX_KEYS.LOADING, newState => this.checkControlLoading(newState));
    this.checkControlLoading(Pubx.get(PUBX_KEYS.LOADING));
  }

  componentWillUnmount() {
    if (unsubLoading) {
      unsubLoading();
    }
  }

  checkControlLoading(newState) {
    if (newState.controlLoading) {
      this.base.classList.add('wasmboy-controls--control-loading');
    } else {
      this.base.classList.remove('wasmboy-controls--control-loading');
    }
  }

  render() {
    return (
      <div class="enemy-control">
        <h1>Enemy controller</h1>
        <div>
          <i>Will eventually do something.</i>
        </div>

        {/* Play/Pause Toggle */}
        <div class="enemy-control_moves">
          <button onClick={() => WasmBoy.setSpeed(0.5)}>Move 0</button>
          <button onClick={() => WasmBoy.setSpeed(1.0)}>Move 1</button>
          <button onClick={() => WasmBoy.setSpeed(2.0)}>Move 2</button>
          <button onClick={() => WasmBoy.setSpeed(4.0)}>Move 3</button>
        </div>
      </div>
    );
  }
}
