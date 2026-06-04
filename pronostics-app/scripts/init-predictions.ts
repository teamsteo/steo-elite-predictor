/**
 * Script pour initialiser le fichier predictions.json sur GitHub
 */

const GITHUB_REPO = 'steohidy/my-project';
const GITHUB_BRANCH = 'master';
const PREDICTIONS_FILE_PATH = 'data/predictions.json';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

async function initPredictionsFile() {
  if (!GITHUB_TOKEN) {
    console.error('❌ GITHUB_TOKEN non défini');
    process.exit(1);
  }

  const initialData = {
    predictions: [],
    stats: null,
    lastUpdated: new Date().toISOString()
  };

  try {
    // Vérifier si le fichier existe déjà
    const getRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${PREDICTIONS_FILE_PATH}`,
      { 
        headers: { 
          Authorization: `token ${GITHUB_TOKEN}`, 
          Accept: 'application/vnd.github.v3+json' 
        } 
      }
    );
    
    if (getRes.ok) {
      console.log('✅ Le fichier predictions.json existe déjà');
      const fileInfo = await getRes.json();
      console.log(`   Taille: ${fileInfo.size} bytes`);
      return;
    }

    // Créer le fichier
    console.log('📝 Création du fichier predictions.json...');
    const content = Buffer.from(JSON.stringify(initialData, null, 2)).toString('base64');
    
    const saveRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${PREDICTIONS_FILE_PATH}`,
      {
        method: 'PUT',
        headers: { 
          Authorization: `token ${GITHUB_TOKEN}`, 
          Accept: 'application/vnd.github.v3+json', 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          message: '📊 Initialisation predictions.json',
          content,
          branch: GITHUB_BRANCH
        })
      }
    );
    
    if (saveRes.ok) {
      console.log('✅ Fichier predictions.json créé avec succès!');
    } else {
      const error = await saveRes.text();
      console.error('❌ Erreur création:', error);
    }
  } catch (error) {
    console.error('❌ Erreur:', error);
  }
}

initPredictionsFile();
