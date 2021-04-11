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

  useMove(moveIndex) {
    //TODO: write appropriate memory address?
    // IF button is enabled, then can assume it's safe to write to memory
    console.log('using move %d', moveIndex);
  }

  render() {
    return (
      <div class="enemy-control">
        <h1>Enemy controller</h1>
        <div>
          <i>Will eventually do something.</i>
        </div>

        {/* Buttons to select pokemon move*/}
        <div class="enemy-control_moves">
          <button onClick={() => this.useMove(0)}>Move 0</button>
          <button onClick={() => this.useMove(1)}>Move 1</button>
          <button onClick={() => this.useMove(2)}>Move 2</button>
          <button onClick={() => this.useMove(3)}>Move 3</button>
        </div>

        {/* Buttons to select pokemon to switch to*/}
        <div class="enemy-control_switch">
          <button onClick={() => this.changeSwitchMon(0)}>Mon 0</button>
          <button onClick={() => this.changeSwitchMon(1)}>Mon 1</button>
          <button onClick={() => this.changeSwitchMon(2)}>Mon 2</button>
          <button onClick={() => this.changeSwitchMon(3)}>Mon 3</button>
          <button onClick={() => this.changeSwitchMon(4)}>Mon 4</button>
          <button onClick={() => this.changeSwitchMon(5)}>Mon 5</button>
        </div>
      </div>
    );
  }
}
