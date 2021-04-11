import { h } from 'preact';

import { Pubx } from 'pubx';

import { PUBX_KEYS } from '../../pubx.config';

import Command from '../command';

import EnemyControl from '../../components/pokehack/enemyControl/enemyControl';

class EnemyController extends Command {
  constructor() {
    super('pokehack:enemy_control');
    this.options.label = 'Enemy Controls';
  }

  execute() {
    Pubx.get(PUBX_KEYS.WIDGET).addWidget({
      component: <EnemyControl />,
      label: 'Enemy Controls'
    });
  }
}

const exportedCommands = [new EnemyController()];
export default exportedCommands;
