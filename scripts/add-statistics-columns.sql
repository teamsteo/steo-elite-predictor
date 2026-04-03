-- Ajouter les colonnes statistiques à la table ml_patterns

ALTER TABLE ml_patterns 
ADD COLUMN IF NOT EXISTS ci_lower INTEGER,
ADD COLUMN IF NOT EXISTS ci_upper INTEGER,
ADD COLUMN IF NOT EXISTS p_value DECIMAL(10,4),
ADD COLUMN IF NOT EXISTS significance VARCHAR(20) DEFAULT 'significant';

-- Significance peut être: 'highly_significant', 'significant', 'marginal', 'not_significant'
