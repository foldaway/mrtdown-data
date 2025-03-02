import { ComponentModel } from '../model/ComponentModel';

const REGEX_TRAIN_RELATED =
  /(MRT|LRT|train|track|additional travel time|regular svc|travel time|additional travell?ing time|line|fault)/i;

const componentIds = ComponentModel.getAllIds();

export function isTextRailRelated(text: string): boolean {
  const containsComponentIds = componentIds.some((id) =>
    text.toLowerCase().includes(id.toLowerCase()),
  );
  if (containsComponentIds) {
    return true;
  }

  return REGEX_TRAIN_RELATED.test(text);
}
