import { buildOverview } from './buildOverview';
import { buildIssuesHistory } from './buildIssuesHistory';
import { buildStatistics } from './buildStatistics';
import { buildStationIndex } from './buildStationIndex';
import { buildStationTranslatedNames } from './buildStationTranslatedNames';
import { buildStationManifests } from './buildStationManifests';
import { buildComponentManifests } from './buildComponentManifests';
import { buildComponentIndex } from './buildComponentIndex';

buildOverview();
buildIssuesHistory();
buildStatistics();
buildStationIndex();
buildStationTranslatedNames();
buildStationManifests();
buildComponentManifests();
buildComponentIndex();
